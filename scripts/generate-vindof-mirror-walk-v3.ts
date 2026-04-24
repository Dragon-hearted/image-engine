/**
 * Vindof Mirror Walk v3 Storyboard Generator
 *
 * 13-scene rewrite extending v2 with character-sheet identity threading.
 *
 * What's new vs v2:
 *   - NEW Scene 01: "Empty Plaza Establishing" — wide locked-off shot of the
 *     empty museum plaza with no characters in frame. The held beat that the
 *     walk-in (now S02) extends from.
 *   - Scene 02 (was v2 S01): "Convergence Walk-in" — same content, refs now
 *     thread the character body-front portraits.
 *   - Scene 03 (was v2 S02): "The Bump" — REWRITTEN for realism. Adds
 *     explicit shoulder compression, hair displacement vectors with motion
 *     blur, AirPods physics with motion-blur trails (kinetic, not perfectly
 *     suspended), micro-shoulder rotation pre-impact, subtle stone-dust kick
 *     at feet, weight transfer in stance. References the higgsfield 3D ref
 *     for motion language but rendered photorealistically.
 *   - Scenes 04-13: same scene content as v2 S03-S12, renumbered. Each
 *     scene that features a character now threads the angle-matched
 *     character-sheet portrait via referenceImageIds for identity
 *     consistency.
 *   - Reference-image priority rule (3 max per scene):
 *       1. Character portrait views (tier 0 — pixel anchor for identity)
 *       2. Prior-scene anchor (tier 3 — environment continuity)
 *       3. Product image refs (tier 4 — fallback for garment accuracy)
 *
 * Requires the character sheet manifest at:
 *   systems/scene-board/clients/vindof/characters/manifest.json
 * Generate it first via:
 *   bun scripts/generate-vindof-character-sheets.ts
 *
 * Uses NanoBanana Pro (gemini-3-pro-image-preview) at 2K.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-mirror-walk-v3.ts
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { insertImage, getImage, db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_DIR =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum";
const ASSETS_DIR = `${STORYBOARD_DIR}/assets`;
const MODEL = "gemini-3-pro-image-preview";
const CHARACTERS_MANIFEST_PATH =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/characters/manifest.json";

if (!existsSync("./uploads")) mkdirSync("./uploads");
if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

// ─── Style Anchor Preamble (verbatim across every prompt) ───

const PREAMBLE = `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.`;

// ─── Character descriptors (for reuse across scenes) ───

const CHAR_A = `Character A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear.`;

const CHAR_B = `Character B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring in his left ear. One white AirPod Pro in his right ear.`;

// ─── Character manifest types + loader ───

type CharacterViewKey =
	| "body-front"
	| "body-back"
	| "face-front"
	| "face-back"
	| "face-left"
	| "face-right";

interface CharacterPortraits {
	"body-front"?: string;
	"body-back"?: string;
	"face-front"?: string;
	"face-back"?: string;
	"face-left"?: string;
	"face-right"?: string;
}

interface CharacterEntry {
	portraits: CharacterPortraits;
}

interface CharacterManifest {
	client: string;
	characters: Record<string, CharacterEntry>;
}

type SceneCameraAngle =
	| "front"
	| "back"
	| "left"
	| "right"
	| "close-up"
	| "wide";

const ANGLE_TO_VIEW: Record<SceneCameraAngle, CharacterViewKey> = {
	front: "body-front",
	back: "body-back",
	left: "face-left",
	right: "face-right",
	"close-up": "face-front",
	wide: "body-front",
};

const FALLBACK_ORDER: CharacterViewKey[] = [
	"body-front",
	"face-front",
	"body-back",
	"face-left",
	"face-right",
	"face-back",
];

function loadCharacterManifest(): CharacterManifest {
	if (!existsSync(CHARACTERS_MANIFEST_PATH)) {
		console.error(
			`\n✗ Character manifest not found at:\n  ${CHARACTERS_MANIFEST_PATH}\n`,
		);
		console.error(
			"Run `bun scripts/generate-vindof-character-sheets.ts` first.\n",
		);
		process.exit(1);
	}
	try {
		const raw = readFileSync(CHARACTERS_MANIFEST_PATH, "utf-8");
		const parsed = JSON.parse(raw) as CharacterManifest;
		if (!parsed.characters || typeof parsed.characters !== "object") {
			throw new Error("manifest.characters missing or malformed");
		}
		return parsed;
	} catch (err) {
		console.error(
			`\n✗ Failed to parse character manifest at ${CHARACTERS_MANIFEST_PATH}`,
		);
		console.error(`  ${(err as Error).message}\n`);
		console.error(
			"Run `bun scripts/generate-vindof-character-sheets.ts` to regenerate.\n",
		);
		process.exit(1);
	}
}

/**
 * Pick the best character-sheet view for a given scene camera angle.
 * Falls back through the standard ordering when the angle-matched view
 * is missing (e.g. generation failed).
 *
 * Returns undefined if NO portrait view exists for this character — caller
 * must handle that case (typically with a clear error + skip/abort).
 */
function pickCharacterView(
	manifest: CharacterManifest,
	slug: string,
	angle: SceneCameraAngle,
): string | undefined {
	const character = manifest.characters[slug];
	if (!character || !character.portraits) {
		console.warn(
			`  ⚠ Character "${slug}" missing from manifest — no portrait reference will be threaded.`,
		);
		return undefined;
	}
	const preferred = ANGLE_TO_VIEW[angle];
	const order = [preferred, ...FALLBACK_ORDER.filter((k) => k !== preferred)];
	for (const key of order) {
		const id = character.portraits[key];
		if (id) {
			if (key !== preferred) {
				console.warn(
					`  ⚠ Character "${slug}" missing preferred view "${preferred}" for angle "${angle}" — falling back to "${key}".`,
				);
			}
			return id;
		}
	}
	console.warn(
		`  ⚠ Character "${slug}" has no usable portrait view in any fallback slot.`,
	);
	return undefined;
}

/**
 * Build the final referenceImageIds list for a scene per the priority rule:
 *   tier 0: character portrait views (always win)
 *   tier 3: prior-scene environment anchor (envAnchor)
 *   tier 4: product image refs (lowest priority — dropped first)
 *
 * Capped at 3 references total. Drops lowest-priority refs first when
 * character views push the total over the cap.
 */
function buildSceneRefs(
	manifest: CharacterManifest,
	opts: {
		chars: ("a" | "b")[];
		angle: SceneCameraAngle;
		envAnchor?: string;
		productRefs?: string[];
	},
): string[] {
	const HARD_CAP = 3;
	const charRefs: string[] = [];
	for (const c of opts.chars) {
		const slug = c === "a" ? "character-a" : "character-b";
		const id = pickCharacterView(manifest, slug, opts.angle);
		if (id && !charRefs.includes(id)) charRefs.push(id);
	}

	const remaining1 = Math.max(0, HARD_CAP - charRefs.length);
	const envRefs: string[] =
		opts.envAnchor && remaining1 > 0 ? [opts.envAnchor] : [];

	const usedSoFar = charRefs.length + envRefs.length;
	const remaining2 = Math.max(0, HARD_CAP - usedSoFar);
	const productRefs = (opts.productRefs ?? [])
		.filter((id) => !charRefs.includes(id) && !envRefs.includes(id))
		.slice(0, remaining2);

	return [...charRefs, ...envRefs, ...productRefs];
}

// ─── Step 1: Import product reference images ───

const productImages = [
	{
		id: "vindof-lazy-bunch-shirt",
		path: `${STORYBOARD_DIR}/products/lazy-bunch-camp-shirt.jpg`,
		name: "Vindof The Lazy Bunch Cream Camp-Collar Shirt",
		mimeType: "image/jpeg",
	},
	{
		id: "vindof-red-dot-polo",
		path: `${STORYBOARD_DIR}/products/red-dot-polo.png`,
		name: "Vindof Red and White Dot-Pattern Knit Polo",
		mimeType: "image/png",
	},
];

console.log("═══ Loading character manifest ═══\n");
const manifest = loadCharacterManifest();
console.log(`  ✓ Loaded manifest for client "${manifest.client}"`);
console.log(
	`  ✓ Characters: ${Object.keys(manifest.characters).join(", ")}\n`,
);

console.log("═══ Importing product reference images ═══\n");

for (const p of productImages) {
	if (getImage(p.id)) {
		console.log(`  ✓ ${p.name} already imported (${p.id})`);
		continue;
	}
	const file = Bun.file(p.path);
	if (!(await file.exists())) {
		console.error(`  ✗ File not found: ${p.path}`);
		process.exit(1);
	}
	const size = file.size;
	insertImage({
		id: p.id,
		filename: p.path.split("/").pop()!,
		originalName: p.name,
		path: p.path,
		mimeType: p.mimeType,
		size,
		createdAt: new Date().toISOString(),
	});
	console.log(`  ✓ Imported ${p.name} (${p.id})`);
}

// ─── Helpers ───

function findImageIdByGeneration(genId: string): string {
	const row = db
		.prepare("SELECT id FROM images WHERE filename LIKE ?")
		.get(`${genId}%`) as { id: string } | null;
	if (!row) throw new Error(`No image found for generation ${genId}`);
	return row.id;
}

function copyToAssets(genId: string, sceneName: string): string {
	const srcPng = `./uploads/${genId}.png`;
	const srcJpg = `./uploads/${genId}.jpg`;
	const src = existsSync(srcPng) ? srcPng : srcJpg;
	const ext = src.endsWith(".png") ? "png" : "jpg";
	const dest = `${ASSETS_DIR}/${sceneName}.${ext}`;
	copyFileSync(src, dest);
	return dest;
}

const results: {
	scene: string;
	genId: string;
	imageId: string;
	tokens: number;
	file: string;
}[] = [];

async function runScene(args: {
	sceneNum: string;
	sceneName: string;
	assetBasename: string;
	systemInstruction: string;
	prompt: string;
	referenceImageIds: string[];
}) {
	console.log(
		`\n═══ Generating Scene ${args.sceneNum} — ${args.sceneName} ═══\n`,
	);
	console.log(
		`  refs: [${args.referenceImageIds.join(", ") || "(none)"}] (${args.referenceImageIds.length})`,
	);
	const gen = await generate({
		prompt: args.prompt,
		systemInstruction: args.systemInstruction,
		referenceImageIds: args.referenceImageIds,
		aspectRatio: "9:16",
		imageSize: "2K",
		forceImage: true,
		model: MODEL,
		sceneId: `scene-${args.sceneNum}-v3`,
	});
	const imageId = findImageIdByGeneration(gen.id);
	copyToAssets(gen.id, args.assetBasename);
	results.push({
		scene: `${args.sceneNum} — ${args.sceneName}`,
		genId: gen.id,
		imageId,
		tokens: gen.tokenUsage.totalTokens,
		file: `${args.assetBasename}.png`,
	});
	console.log(
		`  ✓ Generated (${gen.id}) — ${gen.tokenUsage.totalTokens} tokens`,
	);
	return imageId;
}

// ─── Scene 01: Empty Plaza Establishing (NEW) ───

const s01 = await runScene({
	sceneNum: "01",
	sceneName: "Empty Plaza Establishing",
	assetBasename: "v3-scene-01-empty-plaza",
	systemInstruction: `Cinematic editorial establishing shot, premium streetwear brand. Wide 35mm frame, eye-level locked-off. Overcast diffused daylight. Empty modern museum plaza exterior — no people, no cars, no street furniture. Polished pale grey stone, glass + brushed steel facade, overcast sky reflected in the glass. Quiet maximalism, restrained editorial mood. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: Opening establishing shot. The empty stage before the action — a wide held shot of the museum plaza with no characters in frame yet. The setting itself is the subject. Roughly half-second held beat that the next scene's walk-in extends from directly.

Subject: The plaza itself, no people. Polished pale grey stone in large-format slabs filling the lower two-thirds of frame, faint horizontal joint lines visible across the floor at regular intervals. Floor-to-ceiling glass plus brushed steel facade across the back of the plaza, vertical mullions at a regular rhythm dividing the glass into clean panels. Faint track-lit gallery interior just visible through the glass — soft pools of warm tungsten visible behind the cool reflective skin. Overcast sky reflected in the glass with a soft sheen. The polished stone floor picks up a barely-perceptible reflection of the sky and facade.

Environment: Overcast cool 5500K sky filling the upper edge of frame. No people anywhere in the frame. No cars, no street furniture, no signage, no birds. Generous negative space across the entire center of frame where the bump will happen in the next scenes — the plaza is held open and quiet for the action to come.

Camera: 35mm focal length, eye-level, locked-off. Same framing the v3 Scene 02 walk-in will use — so the establishing → walk-in transition cuts cleanly with no reframe between shots.

Lighting: Overcast midday acting as giant softbox — soft wrap diffusion, no hard shadows. Slight specular sheen on the polished stone floor where the diffused sky reflects. Color temperature approximately 5500K, slightly desaturated.

Composition: Architecture upper third, plaza floor lower two-thirds, vertical mullion rhythm in the background giving structural cadence. Strong horizontal anchor along the joint line where the facade meets the floor.

Brand elements: None in this frame — pure environmental setup before the brand garments arrive in the next scene.

Mood: Anticipatory stillness, the world before the story begins. Quiet maximalism rendered as pure architecture and light.

No text in image.`,
	referenceImageIds: [],
});

// ─── Scene 02: Convergence Walk-in (was v2 S01) ───

const s02 = await runScene({
	sceneNum: "02",
	sceneName: "Convergence Walk-in",
	assetBasename: "v3-scene-02-convergence-walkin",
	systemInstruction: `Cinematic editorial establishing shot, premium streetwear brand. Wide 35mm frame, eye-level locked-off. Overcast diffused daylight. Two Indian Gen Z males converging on a convergent horizontal path — A mid-stride moving screen-right, B mid-stride moving screen-left. Quiet maximalism, Wong Kar-wai restraint. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: Opening wide master shot continuing directly from the empty plaza establishing beat. Two strangers on a collision course — Character A walking left-to-right (enters frame from the LEFT edge, moving RIGHTWARD toward screen-right), Character B walking right-to-left (enters frame from the RIGHT edge, moving LEFTWARD toward screen-left). Both mid-stride on a single horizontal path, moments before their shoulders will clip at the exact horizontal center of frame. Their trajectories are perpendicular to the camera axis — they walk across the plaza, not toward or away from camera.

Subject: Two Indian males in full body, mid-stride. ${CHAR_A} He is positioned in the LEFT third of frame, his body facing screen-right, leading with his right leg mid-step, right arm swinging slightly back. His torso is in a 3/4 front angle toward the camera so his cream shirt graffiti print is readable. ${CHAR_B} He is positioned in the RIGHT third of frame, his body facing screen-left (mirror to A), leading with his left leg mid-step, left arm swinging slightly back. His torso is in a 3/4 front angle toward the camera so his red dot polo is readable. The two are roughly equidistant from the vertical centerline, about 2 strides apart from colliding.

Environment: Modern museum plaza exterior — same plaza as the establishing shot. Polished pale grey stone paving in large-format slabs, floor-to-ceiling glass plus brushed steel facade behind the characters, minimal mullions. The glass reflects the overcast sky and a faint secondary silhouette of each character. Faint track-lit gallery interior visible through the glass. Plaza is otherwise completely empty — no other people, no cars, no street furniture.

Camera: 35mm focal length, eye-level, locked-off wide master shot — same framing as the establishing shot for a clean cut. Characters fill the lower two-thirds of frame, architecture fills the upper third.

Lighting: Overcast midday daylight acting as giant softbox. Soft wrap-around diffusion, no hard shadows. Slight specular sheen on the polished stone floor. Colour temperature approximately 5500K, slightly desaturated.

Composition: Mirror-symmetric — A on the left facing right, B on the right facing left, captured mid-stride on a horizontal collision path. The glass facade's vertical steel mullions form a subtle framing rhythm behind them. Generous headroom.

Brand elements: Both Vindof garments clearly visible and readable — cream shirt with red graffiti print on Character A, red and white dot-pattern polo on Character B. No logo overlay, no watermark.

Mood: Quiet anticipation, cinematic stillness, the moment before. Restrained, editorial.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a", "b"],
		angle: "wide",
		envAnchor: s01,
	}),
});

// ─── Scene 03: The Bump (REALISM REWRITE — was v2 S02) ───

const s03 = await runScene({
	sceneNum: "03",
	sceneName: "The Bump (slow-mo, photoreal)",
	assetBasename: "v3-scene-03-bump",
	systemInstruction: `Cinematic medium two-shot capturing a slow-motion shoulder bump rendered as photorealistic live-action. Overcast diffused daylight. Two Indian Gen Z males at the instant of impact at the EXACT center of frame — A moving screen-right, B moving screen-left, shoulders clipping with visible compression. Four AirPods caught mid-air with motion-blur trails. Hair displacement, weight transfer, stone dust kick. Slight handheld micro-jitter. Shallow depth of field. Filmic grain.`,
	prompt: `${PREAMBLE}

Scene context: The impact moment — continuation of Scene 02. Character A (still moving LEFT-to-RIGHT) and Character B (still moving RIGHT-to-LEFT) have just closed the distance and their shoulders clip at the exact center of frame. Four white AirPods caught in mid-air arcing away from their ears as a result of the bump. Hair shifting from the impact. Slow-motion 50% feel — time stretched on the AirPods, but the bodies still register impact weight visibly.

Subject: Medium two-shot from knees to head. ${CHAR_A} He is on the LEFT half of frame, his body in 3/4 profile facing screen-right, right shoulder leading into contact at the vertical center. ${CHAR_B} He is on the RIGHT half of frame, his body in 3/4 profile facing screen-left (mirror to A), left shoulder leading into contact at the vertical center. Both shoulders compress visibly at the contact point — Character A's right deltoid pressing into Character B's left deltoid, fabric of both garments rippling outward in concentric micro-folds from the impact point. Both characters' hair lifts and displaces in motion-blur arcs (Character A's curtain bangs swinging back-up, Character B's longer waves trailing the impact direction). Character A's torso micro-rotates clockwise from the contact, Character B's micro-rotates counter-clockwise — momentum visible as a subtle twist through each upper body. At each character's feet, a subtle puff of fine pale stone dust kicks up where weight transferred during the collision step — visible weight on the planted leg, the trailing leg lifting just clear of the stone.

AirPods physics: Four white AirPods Pro earbuds caught mid-air around their heads, trajectories radiating outward from the collision point — two AirPods arcing up and toward camera-left from Character A's ear area, two AirPods arcing up and toward camera-right from Character B's ear area. Each AirPod has a faint motion-blur trail behind it indicating its trajectory and angular velocity — not perfectly suspended, but caught mid-arc with kinetic momentum visible. The trails are short, soft, directional — they read as motion, not as VFX streaks.

Environment: Same museum plaza as Scenes 01 and 02. Polished pale stone floor under their feet. Glass + brushed steel facade behind them, minimal mullions, reflecting the overcast sky. Plaza still empty.

Camera: 50mm focal length, medium two-shot framing from knee to head. Slight handheld micro-jitter giving the frame organic motion. Slow-motion 50% — time stretched on the AirPods, but the bodies still register impact weight.

Lighting: Same overcast wrap light as the establishing scenes, consistent across the sequence. No hard shadows. Soft sheen on the stone floor and a subtle highlight roll on the glass facade behind.

Composition: Characters meet at the exact vertical center, bodies forming a subtle X-pattern at the shoulder contact point. AirPods arcing into negative space on either side of their heads. Glass facade vertical lines in the background giving structural rhythm.

Brand elements: Both Vindof garments clearly legible — cream shirt with graffiti print and red dot-pattern polo share the frame equally. No logo overlay.

Realism reference: Visual motion language inspired by a 3D-animated AirPods-swap reference clip (kinetic, slow-mo, physics-prioritized) — but rendered as photorealistic live-action editorial photography, not 3D animation aesthetic. Filmic grain, real-world skin texture, real fabric drape, real stone surface, real specular response. Inspired by reference filmic 3D capture motion language but rendered as live-action photography.

Mood: Suspended kinetic energy, filmic slow-motion suspension, the apex moment of the narrative — but grounded by visible weight, compression, and dust.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a", "b"],
		angle: "front",
		envAnchor: s02,
	}),
});

// ─── Scene 04: AirPods Fall — overhead (was v2 S03) ───

const s04 = await runScene({
	sceneNum: "04",
	sceneName: "AirPods Fall (overhead)",
	assetBasename: "v3-scene-04-airpods-fall",
	systemInstruction: `Overhead static top-down macro shot. Four white AirPods Pro earbuds bouncing on polished pale stone. Overcast diffused daylight. Shoes of both characters visible at frame edges — A's white sneakers top (pointing right, mid-stride), B's black loafers bottom (pointing left, mid-stride). Muted desaturated palette. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: The beat immediately after the bump. Top-down overhead view of the plaza stone floor. Four white AirPods Pro earbuds have just fallen and are bouncing and settling on the stone, intermixing between two pairs of shoes that are still mid-stride in opposite directions.

Subject: Four white AirPods Pro earbuds on polished pale grey stone paving, clustered slightly left of center, two of them mid-bounce with a faint motion blur, two settled. White AirPods contrast cleanly against the pale stone. At the TOP edge of frame, Character A's clean white low-top sneakers visible from above, toes pointing toward frame-right (indicating his left-to-right travel direction), cropped at the ankle. At the BOTTOM edge of frame, Character B's black leather loafers visible from above, toes pointing toward frame-left (indicating his right-to-left travel direction), cropped at the ankle. The shoes' orientation makes the opposing trajectories clear even in this overhead crop.

Environment: Polished pale grey stone paving in large-format slabs, joint line running horizontally through lower third. Faint reflection of the overcast sky visible in the stone sheen. No other people or objects in frame.

Camera: Overhead static top-down macro shot, 85mm equivalent feel, shallow depth of field focused on the AirPods. Slight natural vignette.

Lighting: Flat overcast wrap light, consistent with the rest of the sequence. Very soft sheen on the stone giving a barely-perceptible sky reflection. No hard shadows.

Composition: AirPods clustered slightly left-of-center forming an asymmetric quartet. Character A's white sneaker toes enter from the top edge pointing screen-right, Character B's black loafer toes enter from the bottom edge pointing screen-left, framing the AirPods between them with opposing directional cues. Generous negative space.

Brand elements: No brand logos in this frame — pure product moment.

Mood: Beat-drop anticipation, graphic, still. The moment before everything gets swapped.

No text in image.`,
	referenceImageIds: [s02],
});

// ─── Scene 05: Pickup Swap (was v2 S04) ───

const s05 = await runScene({
	sceneNum: "05",
	sceneName: "Pickup Swap",
	assetBasename: "v3-scene-05-pickup-swap",
	systemInstruction: `Overhead close-up, top-down view of two hands reaching diagonally into frame from opposite edges to pick up AirPods from polished pale stone. Cream camp-shirt graffiti sleeve from upper-right; red-and-white dot polo sleeve from lower-left. Overcast light. Shallow DoF. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: Top-down overhead continuation of Scene 04. Two hands enter the frame diagonally from opposite edges, each reaching to grab a pair of AirPods — but each hand is grabbing the wrong pair. This is the swap moment.

Subject: Tighter overhead crop on the plaza stone. From the TOP-RIGHT edge of frame, Character A's right hand enters diagonally reaching down — the cream Vindof camp-shirt sleeve visible with red graffiti-style typography and partial character-head illustration print, fair-skinned forearm with 1-2 silver rings, slim silver chain peeking. From the BOTTOM-LEFT edge of frame, Character B's left hand enters diagonally reaching down — the Vindof red and white dot-pattern polo sleeve visible (deep sangria red dots on off-white ground), white ribbed sleeve hem, fair-skinned forearm clean and unadorned. Two pairs of white AirPods on the pale stone between their hands — Character A's hand grips Character B's pair, Character B's hand grips Character A's pair.

Environment: Polished pale grey stone paving, tighter crop than Scene 04, slab joint line visible. No other people or objects.

Camera: Top-down overhead, 50mm feel, minimal movement. Shallow DoF — both hands and AirPods in sharp focus, stone edges softly out of focus.

Lighting: Flat overcast wrap light, consistent with sequence. Faint sheen on stone.

Composition: Hands enter diagonally from opposing corners, forming an X across the frame. AirPods centered where the diagonal lines meet. Sleeve patterns are the graphic anchor — cream + graffiti red vs red + white dots — clearly identifying each hand's owner.

Brand elements: Both Vindof sleeve patterns prominently visible and legible. No logo overlay.

Mood: Quick, mechanical, unaware — neither character has realized yet.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a", "b"],
		angle: "wide",
		envAnchor: s04,
	}),
});

// ─── Scene 06: Character A Inserts Wrong Pair (was v2 S05) ───

const s06 = await runScene({
	sceneNum: "06",
	sceneName: "Character A Inserts",
	assetBasename: "v3-scene-06-a-inserts",
	systemInstruction: `85mm portrait close-up of Character A (Indian Gen Z male), 3/4 profile facing screen-right (consistent with his L→R travel direction), placing a white AirPod into his left ear. Museum plaza blurred behind. Soft overcast wrap light. Calm neutral pre-reaction expression. Cream camp-collar shirt visible at neck. Shallow DoF.`,
	prompt: `${PREAMBLE}

Scene context: Close-up portrait of Character A in the moment he places the wrong AirPod into his ear — he hasn't registered yet that the music has changed. He has paused mid-stride to put the earbud in, his body still oriented in his travel direction (facing screen-right).

Subject: Character A, Indian male, 20-22, white/fair skin tone, lean build, messy chestnut-brown textured hair with curtain bangs falling over his forehead toward his eyebrows, soft jawline with light stubble, calm self-possessed expression, eyes neutral and unfocused into middle distance (looking screen-right toward where he is headed). His left hand raised, index finger and thumb placing a white AirPod Pro earbud into his left ear. The cream camp-collar of his Vindof "THE LAZY BUNCH" camp shirt visible at his neck, with the red graffiti typography just hinted at the lower edge of frame. Thin silver chain necklace visible. One or two silver rings on the fingers of the hand placing the earbud.

Environment: Museum plaza entirely out of focus behind him — glass and brushed steel facade rendered as soft vertical color blocks, very shallow depth of field.

Camera: 85mm portrait close-up, eye-level, 3/4 profile angle with Character A's face oriented toward screen-right so the camera sees his LEFT cheek in 3/4 view and his left ear (where the earbud is being placed) is closer to camera. Subtle dolly-in feel.

Lighting: Soft overcast wrap light on the face — no hard shadows, gentle roll-off from forehead to jaw. Faint catchlight in eyes. Cream shirt collar softly picks up the same diffused light.

Composition: Face fills the upper two-thirds of frame. Fingers + earbud in the lower-left quadrant. Eyes sit on the upper rule-of-thirds line. Negative space camera-right (the direction he is walking).

Brand elements: Cream camp-collar of Vindof shirt at neck, hint of red graffiti print at lower frame edge. No logo overlay.

Mood: Neutral, pre-reaction, calm. The character is unaware that the music in his ear has just changed.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a"],
		angle: "right",
		envAnchor: s02,
		productRefs: ["vindof-lazy-bunch-shirt"],
	}),
});

// ─── Scene 07: Beat Drop → B Fit Detail 1 (was v2 S06) ───

const s07 = await runScene({
	sceneNum: "07",
	sceneName: "Beat Drop → B Fit Detail 1",
	assetBasename: "v3-scene-07-b-detail-1",
	systemInstruction: `100mm macro close-up of the red and white knit polo's bold large-circle dot pattern — deep sangria red dots on off-white ground. Museum plaza blurred far behind. Overcast diffused light, subtle specular on the knit texture. Slightly off-axis framing, graphic beat-drop punch. Photorealistic product accuracy.`,
	prompt: `${PREAMBLE}

Scene context: The beat drop. Music genre has just changed in Character A's ears because he's now listening through Character B's AirPods. Visual equivalent: a whip-cut macro close-up of Character B's garment — specifically the bold dot pattern of his Vindof red and white knit polo.

Subject: Macro extreme close-up of the torso area of the Vindof red and white knit polo worn by Character B. The bold large-circle/dot grid pattern fills the frame — deep sangria red dots on an off-white ground, dots arranged in a regular grid with slight variation. Knit fabric texture clearly visible — the weave structure of each dot and the off-white negative space. A portion of torso curvature apparent, conveying the fabric is on a body and not flat.

Environment: Museum plaza far behind, entirely out of focus — rendered as a soft blur of pale grey and muted glass tones.

Camera: 100mm macro focal length, extreme shallow depth of field, quick whip-pan entry feel. Slightly off-axis framing — dot pattern running at a subtle diagonal across the frame for visual rhythm rather than dead-horizontal alignment.

Lighting: Overcast wrap light, with a very subtle specular sheen on the knit loops catching the diffused sky.

Composition: Dot grid fills the frame, slightly rotated 5-10 degrees off vertical for graphic energy. Natural vignette at frame edges.

Brand elements: The Vindof polo pattern is the entire subject. Pattern, color, and knit texture must match the reference product shot exactly.

Mood: Beat-drop punch, graphic, rhythmic. The audio swap made visible.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["b"],
		angle: "wide",
		envAnchor: s02,
		productRefs: ["vindof-red-dot-polo"],
	}),
});

// ─── Scene 08: B Fit Detail 2 (was v2 S07) ───

const s08 = await runScene({
	sceneNum: "08",
	sceneName: "B Fit Detail 2",
	assetBasename: "v3-scene-08-b-detail-2",
	systemInstruction: `85mm tight crop close-up of a white ribbed collar meeting a red and white dot-pattern knit polo, with the short-sleeve hem visible in the frame corner. Overcast wrap light. Museum plaza blurred behind. Subtle S-curve composition. Quiet maximalism craft detail. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: Second beat-drop cut continuing the audio-swap visual moment. The detail shifts from pattern to craft — the white ribbed collar of Character B's Vindof polo where it meets the red-and-white dot field, plus a corner of the short-sleeve hem.

Subject: Tight close-up on the white ribbed collar of Character B's Vindof red and white knit polo. The collar has a clean ribbed texture, rolls softly against his neck, and meets the bold large-circle pattern of the polo body — deep sangria red dots on off-white ground — at the button placket. Short-sleeve hem visible in one corner of the frame, showing the clean finish of the knit. A sliver of fair skin at the neck just visible at the top of frame. No face shown in this crop.

Environment: Museum plaza heavily blurred in the background, out of focus.

Camera: 85mm focal length, very tight crop, shallow depth of field — collar ribbing and adjacent dots in sharp focus, rest of the garment falling off.

Lighting: Soft overcast wrap light. Subtle specular on the ribbed collar texture. No hard shadows.

Composition: Collar curve forms a gentle S-line across the frame. Button placket runs vertically through the lower half. Short-sleeve hem tucks into the upper-left corner. Dot pattern fills the remaining negative space.

Brand elements: Vindof polo craft elements — ribbed collar, dot pattern, button placket, sleeve hem — featured as hero detail. Must match the product reference exactly.

Mood: Quiet craft detail, restraint, quality-over-quantity Vindof brand value made visible.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["b"],
		angle: "wide",
		envAnchor: s07,
		productRefs: ["vindof-red-dot-polo"],
	}),
});

// ─── Scene 09: Character B Inserts Wrong Pair (was v2 S08) ───

const s09 = await runScene({
	sceneNum: "09",
	sceneName: "Character B Inserts",
	assetBasename: "v3-scene-09-b-inserts",
	systemInstruction: `85mm portrait close-up of Character B (Indian Gen Z male), 3/4 profile facing screen-left (consistent with his R→L travel direction), placing a white AirPod into his right ear. Museum plaza blurred behind. Soft overcast wrap light. Neutral pre-reaction expression. Red and white dot-pattern polo collar visible. Shallow DoF.`,
	prompt: `${PREAMBLE}

Scene context: Mirror beat to Scene 06. Character B places the wrong AirPod into his right ear. Framing mirrors the Scene 06 insert shot so the two cut together symmetrically. He has paused mid-stride, his body still oriented in his travel direction (facing screen-left).

Subject: Character B, Indian male, 20-22, white/fair skin, lean build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident resting expression, eyes neutral and unfocused into middle distance (looking screen-left toward where he is headed). His right hand raised, index finger and thumb placing a white AirPod Pro earbud into his right ear. The white ribbed collar of his Vindof red and white dot-pattern knit polo visible at his neck, with the red circle/dot pattern hinted at the lower edge of frame. Small gold hoop earring in his left ear just visible on the side of his head away from the earbud. Plain black cord necklace at the base of his neck.

Environment: Museum plaza entirely out of focus behind him — inverse angle to Scene 06 so the blurred architecture appears from the opposite direction (plaza falls off toward camera-right in this frame because he is headed screen-left).

Camera: 85mm portrait close-up, eye-level, 3/4 profile angle with Character B's face oriented toward screen-left so the camera sees his RIGHT cheek in 3/4 view and his right ear (where the earbud is being placed) is closer to camera. This deliberately mirrors Scene 06.

Lighting: Soft overcast wrap light matching Scene 06 exactly. No hard shadows, gentle roll-off, faint eye catchlight.

Composition: Face fills the upper two-thirds of frame. Fingers + earbud in the lower-right quadrant (mirrors Scene 06's lower-left). Negative space camera-left (the direction he is walking).

Brand elements: White ribbed collar of Vindof polo visible at neck, hint of red dot pattern at lower edge. No logo overlay.

Mood: Neutral, pre-reaction, calm. Character B has not yet realized the music has changed.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["b"],
		angle: "left",
		envAnchor: s02,
		productRefs: ["vindof-red-dot-polo"],
	}),
});

// ─── Scene 10: Beat Drop → A Fit Detail 1 (was v2 S09) ───

const s10 = await runScene({
	sceneNum: "10",
	sceneName: "Beat Drop → A Fit Detail 1",
	assetBasename: "v3-scene-10-a-detail-1",
	systemInstruction: `100mm macro close-up of a cream camp-collar shirt featuring red graffiti-style spray-paint typography "THE LAZY BUNCH" and three stylised illustrated character head portraits on the front. Museum plaza blurred far behind. Overcast diffused light. Slightly off-axis graphic framing. Photorealistic product accuracy.`,
	prompt: `${PREAMBLE}

Scene context: The second beat drop. Music genre has just changed in Character B's ears because he's now listening through Character A's AirPods. Visual whip-cut to Character A's Vindof camp shirt graffiti print.

Subject: Macro extreme close-up of the front torso area of Character A's Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up shirt. The red graffiti-style spray-painted typography "THE LAZY BUNCH" dominates the frame along with three stylised illustrated character head portraits — one with a red bandana and headphones looking upward, one with taped-over glasses at a lower angle, one with a red cap and partial face covering. Washed-out cream fabric base with visible texture and subtle distress marks. Button placket running vertically through part of the composition. Portion of torso curvature apparent, conveying the shirt is on a body.

Environment: Museum plaza far behind, entirely out of focus — soft blur of pale grey and muted glass tones.

Camera: 100mm macro focal length, extreme shallow depth of field, quick whip-pan entry feel. Slightly off-axis framing — graphic print running at a subtle diagonal for visual energy rather than perfectly square on.

Lighting: Overcast wrap light. Slight specular on the fabric weave catching the diffused sky. No hard shadows.

Composition: Graffiti typography + character illustrations fill the frame, rotated 5-10 degrees off vertical for rhythm. Natural vignette at edges.

Brand elements: The Vindof "THE LAZY BUNCH" print is the entire subject — red spray-paint typography and three character-head illustrations must match the product reference exactly in style, color, placement, and line quality.

Mood: Beat-drop punch, graphic. Quiet Maximalism made loud for a single frame — the restrained character now wearing a loud print, rendered as hero detail.

No text in image aside from the garment's own printed graphic graffiti "THE LAZY BUNCH" typography which is part of the Vindof shirt design itself — this text is the physical garment print and must be preserved exactly as shown in the reference image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a"],
		angle: "wide",
		envAnchor: s02,
		productRefs: ["vindof-lazy-bunch-shirt"],
	}),
});

// ─── Scene 11: A Fit Detail 2 (was v2 S10) ───

const s11 = await runScene({
	sceneNum: "11",
	sceneName: "A Fit Detail 2",
	assetBasename: "v3-scene-11-a-detail-2",
	systemInstruction: `85mm tight crop close-up of a cream camp-collar shirt's collar and top button — slightly unbuttoned — with the interior "VINDOF" woven neck label just visible. Washed cream fabric texture. Museum plaza blurred behind. Overcast wrap light. Subtle composition, quiet craft detail. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: Second beat-drop cut continuing the audio-swap visual moment. Detail shifts from the loud graffiti print to the craft element — the camp collar of Character A's Vindof shirt, worn slightly unbuttoned, with the interior Vindof neck label glimpsed.

Subject: Tight close-up on the camp-style spread collar of Character A's Vindof "THE LAZY BUNCH" cream short-sleeve shirt. Collar worn slightly unbuttoned, top button undone. Interior of collar shows the white woven "VINDOF" neck label with size tag. Cream/off-white fabric with subtle washed/distressed texture visible in the weave. A sliver of fair skin at the neckline visible. Portion of the red graffiti print just hinted at the lower edge of frame. No face visible — frame is tight on the collar detail.

Environment: Museum plaza heavily out of focus in the background.

Camera: 85mm focal length, very tight crop on the collar and neck area, shallow DoF — collar and neck label in sharp focus, rest of the garment falling off softly.

Lighting: Soft overcast wrap light. Subtle specular on the crisp collar edge. No hard shadows.

Composition: Camp collar curve runs diagonally across the frame. Top button area and the interior Vindof neck label sit just off-center. Hint of red graffiti print anchors the lower frame.

Brand elements: Vindof garment craft hero — collar construction, button quality, interior woven neck label with the word "VINDOF" on it visible as the brand moment.

Mood: Quiet craft detail, intentional restraint. The brand label is revealed subtly, not shouted.

No text in image aside from the interior Vindof neck label on the garment — this is the physical brand tag woven into the shirt and must be preserved as shown in the reference image. No overlay text.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a"],
		angle: "wide",
		envAnchor: s10,
		productRefs: ["vindof-lazy-bunch-shirt"],
	}),
});

// ─── Scene 12: Handoff — hands (was v2 S11) ───

const s12 = await runScene({
	sceneNum: "12",
	sceneName: "Handoff (hands)",
	assetBasename: "v3-scene-12-handoff",
	systemInstruction: `85mm close-up of two hands meeting at the center of frame, exchanging white AirPod earbuds palm-to-palm. Cream camp-shirt graffiti sleeve enters from the LEFT (Character A's travel side), red and white dot-pattern polo sleeve enters from the RIGHT (Character B's travel side). Museum plaza blurred behind. Overcast wrap light. Silent craft moment. Photorealistic.`,
	prompt: `${PREAMBLE}

Scene context: The handoff. Both characters have realized the swap through the preceding beat-drop fit-detail cuts. Without speaking or fully turning toward each other, they exchange the correct AirPods palm-to-palm at the center of the frame. The sleeve entry sides are consistent with the established trajectories: Character A (L→R walker) offers his hand from the LEFT side of frame moving slightly right-ward; Character B (R→L walker) offers his hand from the RIGHT side of frame moving slightly left-ward.

Subject: Two hands meet at the exact center of frame, palm-open, exchanging white AirPod Pro earbuds. From the LEFT side of frame, Character A's right hand enters — cream Vindof "THE LAZY BUNCH" camp-shirt short sleeve visible at the wrist with red graffiti-style typography and partial character-head print, fair-skinned forearm with 1-2 silver rings on the fingers, thin silver chain just visible at the edge of frame, palm open offering Character B's pair of AirPods. From the RIGHT side of frame, Character B's left hand enters — Vindof red and white dot-pattern knit polo short sleeve visible at the wrist with the white ribbed sleeve hem, fair-skinned forearm clean, palm open offering Character A's pair of AirPods. Two white AirPods in the air between the palms mid-exchange, or just settling into the receiving palms.

Environment: Museum plaza blurred behind the hands — soft architectural blur of pale stone and brushed steel.

Camera: 85mm focal length, medium close-up on hands and forearms, subtle dolly-in feel. Shallow depth of field — hands and AirPods razor sharp, everything beyond going soft.

Lighting: Soft overcast wrap light, consistent with the full sequence. Subtle sheen on the white AirPod casings. Shirt and polo sleeve patterns clearly lit.

Composition: Hands meet at exact center, forming a near-horizontal bridge across the frame. Cream + graffiti sleeve pattern on the left, red + white dot sleeve pattern on the right — the two Vindof pieces framed together as visual equals. AirPods in the negative space between palms. Background architectural blur as vertical structure behind.

Brand elements: Both Vindof garments share the frame equally, both patterns clearly legible. This is the moment the two pieces are visually paired. No logo overlay.

Mood: Silent understanding, quiet transaction, craft moment. No eye contact needed — the exchange itself is the conversation. Quiet Maximalism rendered as a gesture.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a", "b"],
		angle: "wide",
		envAnchor: s05,
	}),
});

// ─── Scene 13: Walk Away (was v2 S12) ───

const s13 = await runScene({
	sceneNum: "13",
	sceneName: "Walk Away",
	assetBasename: "v3-scene-13-walk-away",
	systemInstruction: `35mm wide, locked-off final beat bookending Scene 02. Both Indian Gen Z males continue their original trajectories past center — Character A walks toward the RIGHT edge of frame, Character B walks toward the LEFT edge of frame. 3/4 rear profiles as they walk away. Empty museum plaza. Overcast diffused daylight. Symmetric composition. Quiet maximalism close.`,
	prompt: `${PREAMBLE}

Scene context: Final beat, bookending Scene 02. Both characters have continued their original walking trajectories past the center. Character A (still moving LEFT-to-RIGHT) is now on the RIGHT half of frame walking toward the right edge and heading off-frame to screen-right. Character B (still moving RIGHT-to-LEFT) is now on the LEFT half of frame walking toward the left edge and heading off-frame to screen-left. They have passed each other. This is NOT mirror-reversed from Scene 02 — each character continues in the SAME direction they were travelling in Scene 02; only their position in frame has shifted from entry-side to exit-side.

Subject: Wide full-body view of both Indian Gen Z male characters, seen from 3/4 rear angle as they walk away in their original trajectories. Character A is in the RIGHT third of frame, his back and right shoulder toward camera, body facing screen-right, walking toward the right edge — cream Vindof "THE LAZY BUNCH" camp-shirt visible from behind (back-of-collar and cream fabric drape), grey heather wide-leg baggy trousers, white low-top sneakers, right leg mid-step. Character B is in the LEFT third of frame, his back and left shoulder toward camera, body facing screen-left, walking toward the left edge — red and white dot-pattern Vindof knit polo visible from behind (the dot pattern continues on the back), black wide-leg baggy trousers, black leather loafers, left leg mid-step. Each with one white AirPod Pro in the correct ear (A in left ear, B in right ear) just visible at their 3/4-rear angle. Same messy hairstyles as earlier scenes — A with chestnut-brown curtain bangs, B with longer dark tousled waves.

Environment: Same modern museum plaza as Scenes 01 and 02. Polished pale grey stone floor, floor-to-ceiling glass + brushed steel facade behind, empty plaza. The glass facade vertical mullions match Scene 02 exactly.

Camera: 35mm focal length, eye-level, locked-off wide shot exactly matching the framing of Scene 02 so the two scenes feel like bookends. Characters fill the lower two-thirds, architecture fills the upper third.

Lighting: Same overcast midday diffusion as Scene 02. No hard shadows. Slight specular on the polished stone floor.

Composition: A is positioned in the RIGHT third walking toward right edge; B is positioned in the LEFT third walking toward left edge. Plaza negative space dominates the center (where they collided in earlier scenes — now empty). The scene should read as a direct continuation of Scene 02's motion, not a reversal.

Brand elements: Both Vindof garments visible from the 3/4 rear — cream shirt back on A, dot-pattern polo back on B. No logo overlay.

Mood: Quiet close, final held beat. No looking back. The story ends as quietly as it began — each character continuing the path they started.

No text in image.`,
	referenceImageIds: buildSceneRefs(manifest, {
		chars: ["a", "b"],
		angle: "back",
		envAnchor: s02,
	}),
});

// ─── Summary ───

const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

console.log("\n═══════════════════════════════════════════════");
console.log("  GENERATION COMPLETE (v3)");
console.log("═══════════════════════════════════════════════\n");
console.log("| Scene | Generation ID | Tokens | File |");
console.log("|-------|--------------|--------|------|");
for (const r of results) {
	console.log(`| ${r.scene} | ${r.genId} | ${r.tokens} | ${r.file} |`);
}
console.log(`\nTotal tokens: ${totalTokens}`);
console.log(`Images copied to: ${ASSETS_DIR}/`);

const outputJson = {
	version: "v3",
	model: MODEL,
	manifestPath: CHARACTERS_MANIFEST_PATH,
	results: results.map((r) => ({
		scene: r.scene,
		generationId: r.genId,
		imageId: r.imageId,
		tokens: r.tokens,
		file: r.file,
	})),
	totalTokens,
};
await Bun.write(
	`${ASSETS_DIR}/generation-log-v3.json`,
	JSON.stringify(outputJson, null, 2),
);
console.log(`\nGeneration log saved to: ${ASSETS_DIR}/generation-log-v3.json`);
