/**
 * Vindof Mirror Walk v2 — RESUME from Scene 08.
 * Scenes 01-07 already generated; reuses their image IDs as references.
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_DIR =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum";
const ASSETS_DIR = `${STORYBOARD_DIR}/assets`;
const MODEL = "gemini-2.5-flash-image";

if (!existsSync("./uploads")) mkdirSync("./uploads");

const PREAMBLE = `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.`;

const CHAR_A = `Character A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear.`;

const CHAR_B = `Character B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring in his left ear. One white AirPod Pro in his right ear.`;

// Pre-existing image IDs from scenes 01-07 (already generated)
const s01 = "0bdad740-c649-4827-8acf-e3d34e10ef6b";
const s04 = "80bed2e2-1ebf-4051-829d-d8ee5a81e4a7";
const s06 = "e99cfa93-2b01-48c0-b84f-dde316a75639";
const s09_ref_src = s01; // reference for s09 uses s01

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
	console.log(`\n═══ Generating Scene ${args.sceneNum} — ${args.sceneName} ═══\n`);
	let lastErr: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const gen = await generate({
				prompt: args.prompt,
				systemInstruction: args.systemInstruction,
				referenceImageIds: args.referenceImageIds,
				aspectRatio: "9:16",
				imageSize: "2K",
				forceImage: true,
				model: MODEL,
				sceneId: `scene-${args.sceneNum}-v2`,
			});
			const imageId = findImageIdByGeneration(gen.id);
			copyToAssets(gen.id, args.assetBasename);
			results.push({
				scene: `${args.sceneNum} — ${args.sceneName}`,
				genId: gen.id,
				imageId,
				tokens: gen.tokenUsage.totalTokens,
				file: `${args.assetBasename}`,
			});
			console.log(
				`  ✓ Generated (${gen.id}) — ${gen.tokenUsage.totalTokens} tokens`,
			);
			return imageId;
		} catch (err) {
			lastErr = err;
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`  ✗ Attempt ${attempt} failed: ${msg}`);
			if (attempt < 3) {
				const delay = 15000 * attempt;
				console.error(`  … retrying in ${delay / 1000}s`);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
	throw lastErr;
}

// ─── Scene 08: Character B Inserts ───
const s08 = await runScene({
	sceneNum: "08",
	sceneName: "Character B Inserts",
	assetBasename: "v2-scene-08-b-inserts",
	systemInstruction: `85mm portrait close-up of Character B (Indian Gen Z male), 3/4 profile facing screen-left (consistent with his R→L travel direction), placing a white AirPod into his right ear. Museum plaza blurred behind. Soft overcast wrap light. Neutral pre-reaction expression. Red and white dot-pattern polo collar visible. Shallow DoF.`,
	prompt: `${PREAMBLE}

Scene context: Mirror beat to Scene 05. Character B places the wrong AirPod into his right ear. Framing mirrors the Scene 05 insert shot so the two cut together symmetrically. He has paused mid-stride, his body still oriented in his travel direction (facing screen-left).

Subject: Character B, Indian male, 20-22, white/fair skin, lean build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident resting expression, eyes neutral and unfocused into middle distance (looking screen-left toward where he is headed). His right hand raised, index finger and thumb placing a white AirPod Pro earbud into his right ear. The white ribbed collar of his Vindof red and white dot-pattern knit polo visible at his neck, with the red circle/dot pattern hinted at the lower edge of frame. Small gold hoop earring in his left ear just visible on the side of his head away from the earbud. Plain black cord necklace at the base of his neck.

Environment: Museum plaza entirely out of focus behind him — inverse angle to Scene 05 so the blurred architecture appears from the opposite direction (plaza falls off toward camera-right in this frame because he is headed screen-left).

Camera: 85mm portrait close-up, eye-level, 3/4 profile angle with Character B's face oriented toward screen-left so the camera sees his RIGHT cheek in 3/4 view and his right ear (where the earbud is being placed) is closer to camera. This deliberately mirrors Scene 05.

Lighting: Soft overcast wrap light matching Scene 05 exactly. No hard shadows, gentle roll-off, faint eye catchlight.

Composition: Face fills the upper two-thirds of frame. Fingers + earbud in the lower-right quadrant (mirrors Scene 05's lower-left). Negative space camera-left (the direction he is walking).

Brand elements: White ribbed collar of Vindof polo visible at neck, hint of red dot pattern at lower edge. No logo overlay.

Mood: Neutral, pre-reaction, calm. Character B has not yet realized the music has changed.

No text in image.`,
	referenceImageIds: [s01, "vindof-red-dot-polo"],
});

// ─── Scene 09: Beat Drop → A Fit Detail 1 ───
const s09 = await runScene({
	sceneNum: "09",
	sceneName: "Beat Drop → A Fit Detail 1",
	assetBasename: "v2-scene-09-a-detail-1",
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
	referenceImageIds: ["vindof-lazy-bunch-shirt", s01],
});

// ─── Scene 10: A Fit Detail 2 ───
const s10 = await runScene({
	sceneNum: "10",
	sceneName: "A Fit Detail 2",
	assetBasename: "v2-scene-10-a-detail-2",
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
	referenceImageIds: ["vindof-lazy-bunch-shirt", s09],
});

// ─── Scene 11: Handoff (hands) ───
const s11 = await runScene({
	sceneNum: "11",
	sceneName: "Handoff (hands)",
	assetBasename: "v2-scene-11-handoff",
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
	referenceImageIds: [s04, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
});

// ─── Scene 12: Walk Away ───
const s12 = await runScene({
	sceneNum: "12",
	sceneName: "Walk Away",
	assetBasename: "v2-scene-12-walk-away",
	systemInstruction: `35mm wide, locked-off final beat bookending Scene 01. Both Indian Gen Z males continue their original trajectories past center — Character A walks toward the RIGHT edge of frame, Character B walks toward the LEFT edge of frame. 3/4 rear profiles as they walk away. Empty museum plaza. Overcast diffused daylight. Symmetric composition. Quiet maximalism close.`,
	prompt: `${PREAMBLE}

Scene context: Final beat, bookending Scene 01. Both characters have continued their original walking trajectories past the center. Character A (still moving LEFT-to-RIGHT) is now on the RIGHT half of frame walking toward the right edge and heading off-frame to screen-right. Character B (still moving RIGHT-to-LEFT) is now on the LEFT half of frame walking toward the left edge and heading off-frame to screen-left. They have passed each other. This is NOT mirror-reversed from Scene 01 — each character continues in the SAME direction they were travelling in Scene 01; only their position in frame has shifted from entry-side to exit-side.

Subject: Wide full-body view of both Indian Gen Z male characters, seen from 3/4 rear angle as they walk away in their original trajectories. Character A is in the RIGHT third of frame, his back and right shoulder toward camera, body facing screen-right, walking toward the right edge — cream Vindof "THE LAZY BUNCH" camp-shirt visible from behind (back-of-collar and cream fabric drape), grey heather wide-leg baggy trousers, white low-top sneakers, right leg mid-step. Character B is in the LEFT third of frame, his back and left shoulder toward camera, body facing screen-left, walking toward the left edge — red and white dot-pattern Vindof knit polo visible from behind (the dot pattern continues on the back), black wide-leg baggy trousers, black leather loafers, left leg mid-step. Each with one white AirPod Pro in the correct ear (A in left ear, B in right ear) just visible at their 3/4-rear angle. Same messy hairstyles as earlier scenes — A with chestnut-brown curtain bangs, B with longer dark tousled waves.

Environment: Same modern museum plaza as Scene 01. Polished pale grey stone floor, floor-to-ceiling glass + brushed steel facade behind, empty plaza. The glass facade vertical mullions match Scene 01 exactly.

Camera: 35mm focal length, eye-level, locked-off wide shot exactly matching the framing of Scene 01 so the two scenes feel like bookends. Characters fill the lower two-thirds, architecture fills the upper third.

Lighting: Same overcast midday diffusion as Scene 01. No hard shadows. Slight specular on the polished stone floor.

Composition: A is positioned in the RIGHT third walking toward right edge; B is positioned in the LEFT third walking toward left edge. Plaza negative space dominates the center (where they collided in earlier scenes — now empty). The scene should read as a direct continuation of Scene 01's motion, not a reversal.

Brand elements: Both Vindof garments visible from the 3/4 rear — cream shirt back on A, dot-pattern polo back on B. No logo overlay.

Mood: Quiet close, final held beat. No looking back. The story ends as quietly as it began — each character continuing the path they started.

No text in image.`,
	referenceImageIds: [s01, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
});

// ─── Summary ───

const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

console.log("\n═══════════════════════════════════════════════");
console.log("  RESUME COMPLETE (Scenes 08-12)");
console.log("═══════════════════════════════════════════════\n");
for (const r of results) {
	console.log(`| ${r.scene} | ${r.genId} | ${r.tokens} |`);
}
console.log(`\nTotal tokens (resumed scenes): ${totalTokens}`);

const outputJson = {
	version: "v2-resume",
	model: MODEL,
	previouslyCompleted: [
		{ scene: "01 — Convergence Wide", genId: "5ba1e066-7771-4e17-b0c0-76e1600f767c", imageId: s01, tokens: 3144 },
		{ scene: "02 — The Bump (slow-mo)", genId: "1b364fab-6a26-4268-a044-9899a1da2ffe", imageId: "ba2d0736-ead6-40f9-94d5-4f90fa54d3ed", tokens: 3274 },
		{ scene: "03 — AirPods Fall (overhead)", genId: "591d8dc9-05ed-4d5d-ac52-ae575228c415", imageId: "422a85b0-5adc-44ae-a87b-d1859a283b46", tokens: 2379 },
		{ scene: "04 — Pickup Swap", genId: "65347f23-5e6d-49ff-adbc-32c6561fb72f", imageId: s04, tokens: 2993 },
		{ scene: "05 — Character A Inserts", genId: "e25dea29-475c-4893-893b-6c4f06766335", imageId: "f6c5a279-c979-4bef-916e-0b6d09ab16ea", tokens: 2831 },
		{ scene: "06 — Beat Drop → B Fit Detail 1", genId: "99b0dc0e-9cce-4a27-b7dd-c9316572b08c", imageId: s06, tokens: 2542 },
		{ scene: "07 — B Fit Detail 2", genId: "7a74f8a8-44ec-4659-8da5-1c19022a1868", imageId: "95c94c05-b6c7-4cb8-9609-71cc8e0cfebc", tokens: 2604 },
	],
	resumedResults: results.map((r) => ({
		scene: r.scene,
		generationId: r.genId,
		imageId: r.imageId,
		tokens: r.tokens,
		file: r.file,
	})),
	resumedTotalTokens: totalTokens,
};
await Bun.write(
	`${ASSETS_DIR}/generation-log-v2.json`,
	JSON.stringify(outputJson, null, 2),
);
console.log(`\nGeneration log saved to: ${ASSETS_DIR}/generation-log-v2.json`);
