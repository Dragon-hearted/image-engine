/**
 * Vindof Mirror Walk Storyboard Generator
 *
 * Generates all 14 scenes for the "airpods-swap-museum / mirror-walk-v1"
 * storyboard sequentially with reference chaining for continuity.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-mirror-walk.ts
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { insertImage, getImage, db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_DIR =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum";
const ASSETS_DIR = `${STORYBOARD_DIR}/assets`;

// Ensure directories exist
if (!existsSync("./uploads")) mkdirSync("./uploads");
if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

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

// ─── Helper: find image record ID from generation ID ───

function findImageIdByGeneration(genId: string): string {
	const row = db
		.prepare("SELECT id FROM images WHERE filename LIKE ?")
		.get(`${genId}%`) as { id: string } | null;
	if (!row) throw new Error(`No image found for generation ${genId}`);
	return row.id;
}

// ─── Helper: copy generated image to storyboard assets ───

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

// ─── Scene 01: Convergence Wide ───

console.log("\n═══ Generating Scene 01 — Convergence Wide ═══\n");

const scene01 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Establishing wide master shot, the opening frame of a silent narrative reel. Two strangers walking toward each other across an empty plaza, moments before their shoulders will clip.

Subject: Two Indian males in full body, mid-stride, walking toward each other from opposite sides of frame. Character A enters from the left — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear. Character B enters from the right — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than A, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring left ear. One white AirPod Pro in his right ear.

Environment: Modern museum plaza exterior. Polished pale grey stone paving in large-format slabs, floor-to-ceiling glass plus brushed steel facade behind the characters, minimal mullions. The glass reflects the overcast sky and a faint secondary silhouette of each character. Faint track-lit gallery interior visible through the glass. Plaza is completely empty — no other people, no cars, no street furniture.

Camera: 35mm focal length, eye-level, locked-off wide master shot. Characters fill the lower two-thirds of frame, architecture fills the upper third.

Lighting: Overcast midday daylight acting as giant softbox. Soft wrap-around diffusion, no hard shadows. Slight specular sheen on the polished stone floor. Colour temperature approximately 5500K, slightly desaturated.

Composition: Symmetric — both figures roughly equidistant from the vertical centerline, captured mid-stride. The glass facade's vertical steel mullions form a subtle framing rhythm behind them. Generous headroom.

Brand elements: Both Vindof garments clearly visible and readable — cream shirt with red graffiti print on Character A, red and white dot-pattern polo on Character B. No logo overlay, no watermark.

Mood: Quiet anticipation, cinematic stillness, the moment before. Restrained, editorial.

No text in image.`,
	systemInstruction: `You are generating a cinematic editorial establishing shot for a premium streetwear brand. Wide 35mm frame, eye-level locked-off composition. Overcast diffused daylight. Two Indian Gen Z males walking toward each other on a modern museum plaza. Subtly desaturated cool palette, quiet maximalism, Wong Kar-wai restraint. No hard shadows. Photorealistic.`,
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-01",
});

const scene01ImageId = findImageIdByGeneration(scene01.id);
copyToAssets(scene01.id, "scene-01-convergence-wide");
results.push({
	scene: "01 — Convergence Wide",
	genId: scene01.id,
	imageId: scene01ImageId,
	tokens: scene01.tokenUsage.totalTokens,
	file: "scene-01-convergence-wide.png",
});
console.log(
	`  ✓ Generated (${scene01.id}) — ${scene01.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 02: The Bump ───

console.log("\n═══ Generating Scene 02 — The Bump ═══\n");

const scene02 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The impact moment. Both characters' shoulders clip at the exact center of frame. Slow-motion feel. Four white AirPods caught in mid-air, arcing away from their ears as a result of the bump. Hair shifting from the impact.

Subject: Character A on the left and Character B on the right meet at the center of frame, shoulders clipping. Character A — Indian male, 20-22, white/fair skin, lean build, messy chestnut-brown textured hair with curtain bangs, light stubble. Wearing oversized Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up with red graffiti-style typography and three character-head illustrations on front, grey heather wide-leg baggy trousers, white low-top sneakers. Character B — Indian male, 20-22, white/fair skin, lean build, messy tousled dark brown/black waves, sharper jawline, clean-shaven. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern, white ribbed collar, short sleeves, black wide-leg baggy trousers, black leather loafers. Four white AirPods Pro earbuds caught mid-air between and around their heads, trajectories radiating outward. Both characters' hair lifting slightly from the impact.

Environment: Same museum plaza as establishing shot. Polished pale stone floor under their feet. Glass + brushed steel facade behind them, minimal mullions, reflecting the overcast sky. Plaza still empty.

Camera: 50mm focal length, medium two-shot framing from knee to head. Slight handheld micro-jitter giving the frame organic motion. Slow-motion feel — sense of time-stretched suspension on the AirPods in mid-air.

Lighting: Same overcast wrap light as the establishing shot, consistent across the sequence. No hard shadows. Soft sheen on the stone floor and a subtle highlight roll on the glass facade behind.

Composition: Characters meet at the exact vertical center, bodies forming a subtle X-pattern at the shoulder contact point. AirPods arcing into negative space on either side of their heads. Glass facade vertical lines in the background giving structural rhythm.

Brand elements: Both Vindof garments clearly legible — cream shirt with graffiti print and red dot-pattern polo share the frame equally. No logo overlay.

Mood: Suspended kinetic energy, filmic slow-motion suspension, the apex moment of the narrative.

No text in image.`,
	systemInstruction: `Cinematic medium two-shot capturing a slow-motion shoulder bump moment. Overcast diffused daylight. Two Indian Gen Z males at the instant of impact, AirPods caught mid-air. Slight handheld micro-jitter feel. Shallow depth of field. Quiet maximalism aesthetic. Photorealistic, filmic grain.`,
	referenceImageIds: [scene01ImageId, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-02",
});

const scene02ImageId = findImageIdByGeneration(scene02.id);
copyToAssets(scene02.id, "scene-02-bump");
results.push({
	scene: "02 — The Bump",
	genId: scene02.id,
	imageId: scene02ImageId,
	tokens: scene02.tokenUsage.totalTokens,
	file: "scene-02-bump.png",
});
console.log(
	`  ✓ Generated (${scene02.id}) — ${scene02.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 03: AirPods Fall ───

console.log("\n═══ Generating Scene 03 — AirPods Fall ═══\n");

const scene03 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The beat immediately after the bump. Top-down overhead view of the plaza stone floor. Four white AirPods Pro earbuds have just fallen and are bouncing and settling on the stone, intermixing between two pairs of shoes.

Subject: Four white AirPods Pro earbuds on polished pale grey stone paving, clustered slightly left of center, two of them mid-bounce with a faint motion blur, two settled. White AirPods contrast cleanly against the pale stone. At the top edge of frame, the toes of Character A's clean white low-top sneakers visible; at the bottom edge of frame, the toes of Character B's black leather loafers visible. Both characters' feet cropped at the ankle.

Environment: Polished pale grey stone paving in large-format slabs, joint line running horizontally through lower third. Faint reflection of the overcast sky visible in the stone sheen. No other people or objects in frame.

Camera: Overhead static top-down macro shot, 85mm equivalent feel, shallow depth of field focused on the AirPods. Slight natural vignette.

Lighting: Flat overcast wrap light, consistent with the rest of the sequence. Very soft sheen on the stone giving a barely-perceptible sky reflection. No hard shadows.

Composition: AirPods clustered slightly left-of-center forming an asymmetric quartet. Character A's white sneaker toes enter from the top edge, Character B's black loafer toes enter from the bottom edge, framing the AirPods between them. Generous negative space.

Brand elements: No brand logos in this frame — pure product moment.

Mood: Beat-drop anticipation, graphic, still. The moment before everything gets swapped.

No text in image.`,
	systemInstruction: `Overhead static macro shot, top-down view of four white AirPods Pro earbuds bouncing on polished pale stone. Overcast diffused daylight, shallow depth of field. Shoes of both characters visible at frame edges. Muted desaturated palette. Quiet maximalism. Photorealistic.`,
	referenceImageIds: [scene01ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-03",
});

const scene03ImageId = findImageIdByGeneration(scene03.id);
copyToAssets(scene03.id, "scene-03-airpods-fall");
results.push({
	scene: "03 — AirPods Fall",
	genId: scene03.id,
	imageId: scene03ImageId,
	tokens: scene03.tokenUsage.totalTokens,
	file: "scene-03-airpods-fall.png",
});
console.log(
	`  ✓ Generated (${scene03.id}) — ${scene03.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 04: Pickup Swap ───

console.log("\n═══ Generating Scene 04 — Pickup Swap ═══\n");

const scene04 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Top-down overhead continuation of the previous beat. Two hands enter the frame diagonally from opposite edges, each reaching to grab a pair of AirPods — but each hand is grabbing the wrong pair. This is the swap moment.

Subject: Tighter overhead crop on the plaza stone. From the top-right edge of frame, Character A's right hand enters diagonally reaching down — the cream Vindof camp-shirt sleeve visible with red graffiti-style typography and partial character-head illustration print, fair-skinned forearm with 1-2 silver rings, slim silver chain peeking. From the bottom-left edge of frame, Character B's left hand enters diagonally reaching down — the Vindof red and white dot-pattern polo sleeve visible (deep sangria red dots on off-white ground), white ribbed sleeve hem, fair-skinned forearm clean and unadorned. Two pairs of white AirPods on the pale stone between their hands — Character A's hand grips Character B's pair, Character B's hand grips Character A's pair.

Environment: Polished pale grey stone paving, tighter crop than Scene 3, slab joint line visible. No other people or objects.

Camera: Top-down overhead, 50mm feel, minimal movement. Shallow DoF — both hands and AirPods in sharp focus, stone edges softly out of focus.

Lighting: Flat overcast wrap light, consistent with sequence. Faint sheen on stone.

Composition: Hands enter diagonally from opposing corners, forming an X across the frame. AirPods centered where the diagonal lines meet. Sleeve patterns are the graphic anchor — cream + graffiti red vs red + white dots — clearly identifying each hand's owner.

Brand elements: Both Vindof sleeve patterns prominently visible and legible. No logo overlay.

Mood: Quick, mechanical, unaware — neither character has realized yet.

No text in image.`,
	systemInstruction: `Overhead close-up, top-down view of two hands reaching into frame from opposite edges to pick up AirPods from polished pale stone. One hand has a cream camp-shirt sleeve with red graffiti print, the other has a red-and-white dot-pattern polo sleeve. Overcast light. Shallow DoF. Photorealistic.`,
	referenceImageIds: [scene03ImageId, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-04",
});

const scene04ImageId = findImageIdByGeneration(scene04.id);
copyToAssets(scene04.id, "scene-04-pickup-swap");
results.push({
	scene: "04 — Pickup Swap",
	genId: scene04.id,
	imageId: scene04ImageId,
	tokens: scene04.tokenUsage.totalTokens,
	file: "scene-04-pickup-swap.png",
});
console.log(
	`  ✓ Generated (${scene04.id}) — ${scene04.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 05: Character A Inserts Wrong Pair ───

console.log("\n═══ Generating Scene 05 — Character A Inserts Wrong Pair ═══\n");

const scene05 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Close-up portrait of Character A in the moment he places the wrong AirPod into his ear — he hasn't registered yet that the music has changed.

Subject: Character A, Indian male, 20-22, white/fair skin tone, lean build, messy chestnut-brown textured hair with curtain bangs falling over his forehead toward his eyebrows, soft jawline with light stubble, calm self-possessed expression, eyes neutral and unfocused into middle distance. His left hand raised, index finger and thumb placing a white AirPod Pro earbud into his left ear. The cream camp-collar of his Vindof "THE LAZY BUNCH" camp shirt visible at his neck, with the red graffiti typography just hinted at the lower edge of frame. Thin silver chain necklace visible. One or two silver rings on the fingers of the hand placing the earbud.

Environment: Museum plaza entirely out of focus behind him — glass and brushed steel facade rendered as soft vertical color blocks, very shallow depth of field.

Camera: 85mm portrait close-up, eye-level, 3/4 profile angle favoring Character A's right cheek toward camera with his left ear (where the earbud is being placed) also visible. Subtle dolly-in feel.

Lighting: Soft overcast wrap light on the face — no hard shadows, gentle roll-off from forehead to jaw. Faint catchlight in eyes. Cream shirt collar softly picks up the same diffused light.

Composition: Face fills the upper two-thirds of frame. Fingers + earbud in the lower-left quadrant. Eyes sit on the upper rule-of-thirds line. Negative space camera-right.

Brand elements: Cream camp-collar of Vindof shirt at neck, hint of red graffiti print at lower frame edge. No logo overlay.

Mood: Neutral, pre-reaction, calm. The character is unaware that the music in his ear has just changed.

No text in image.`,
	systemInstruction: `85mm portrait close-up of an Indian Gen Z male, 3/4 profile, placing a white AirPod earbud into his left ear. Museum plaza blurred behind. Soft overcast wrap light on the face. Calm neutral expression, pre-reaction. Cream camp-collar shirt visible at neck. Shallow DoF. Quiet maximalism. Photorealistic.`,
	referenceImageIds: [scene01ImageId, "vindof-lazy-bunch-shirt"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-05",
});

const scene05ImageId = findImageIdByGeneration(scene05.id);
copyToAssets(scene05.id, "scene-05-a-inserts");
results.push({
	scene: "05 — A Inserts",
	genId: scene05.id,
	imageId: scene05ImageId,
	tokens: scene05.tokenUsage.totalTokens,
	file: "scene-05-a-inserts.png",
});
console.log(
	`  ✓ Generated (${scene05.id}) — ${scene05.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 06: Beat Drop → B Fit Detail 1 ───

console.log("\n═══ Generating Scene 06 — B Fit Detail 1 ═══\n");

const scene06 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The beat drop. Music genre has just changed in Character A's ears because he's now listening through Character B's AirPods. Visual equivalent: a whip-cut macro close-up of Character B's garment — specifically the bold dot pattern of his Vindof red and white knit polo.

Subject: Macro extreme close-up of the torso area of the Vindof red and white knit polo worn by Character B. The bold large-circle/dot grid pattern fills the frame — deep sangria red dots on an off-white ground, dots arranged in a regular grid with slight variation. Knit fabric texture clearly visible — the weave structure of each dot and the off-white negative space. A portion of torso curvature apparent, conveying the fabric is on a body and not flat.

Environment: Museum plaza far behind, entirely out of focus — rendered as a soft blur of pale grey and muted glass tones.

Camera: 100mm macro focal length, extreme shallow depth of field, quick whip-pan entry feel. Slightly off-axis framing — dot pattern running at a subtle diagonal across the frame for visual rhythm rather than dead-horizontal alignment.

Lighting: Overcast wrap light, with a very subtle specular sheen on the knit loops catching the diffused sky.

Composition: Dot grid fills the frame, slightly rotated 5-10 degrees off vertical for graphic energy. Natural vignette at frame edges.

Brand elements: The Vindof polo pattern is the entire subject. No logo overlay.

Mood: Beat-drop punch, graphic, rhythmic. The audio swap made visible.

No text in image.`,
	systemInstruction: `100mm macro close-up of a red and white knit polo shirt's bold large-circle dot pattern — deep sangria red dots on off-white ground. Museum plaza blurred far behind. Overcast diffused light with subtle specular on the knit texture. Slightly off-axis framing, graphic beat-drop punch. Photorealistic.`,
	referenceImageIds: ["vindof-red-dot-polo", scene01ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-06",
});

const scene06ImageId = findImageIdByGeneration(scene06.id);
copyToAssets(scene06.id, "scene-06-b-detail-1");
results.push({
	scene: "06 — B Detail 1",
	genId: scene06.id,
	imageId: scene06ImageId,
	tokens: scene06.tokenUsage.totalTokens,
	file: "scene-06-b-detail-1.png",
});
console.log(
	`  ✓ Generated (${scene06.id}) — ${scene06.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 07: B Fit Detail 2 ───

console.log("\n═══ Generating Scene 07 — B Fit Detail 2 ═══\n");

const scene07 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Second beat-drop cut continuing the audio-swap visual moment. The detail shifts from pattern to craft — the white ribbed collar of Character B's Vindof polo where it meets the red-and-white dot field, plus a corner of the short-sleeve hem.

Subject: Tight close-up on the white ribbed collar of Character B's Vindof red and white knit polo. The collar has a clean ribbed texture, rolls softly against his neck, and meets the bold large-circle pattern of the polo body — deep sangria red dots on off-white ground — at the button placket. Short-sleeve hem visible in one corner of the frame, showing the clean finish of the knit. A sliver of fair skin at the neck just visible at the top of frame. No face shown in this crop.

Environment: Museum plaza heavily blurred in the background, out of focus.

Camera: 85mm focal length, very tight crop, shallow depth of field — collar ribbing and adjacent dots in sharp focus, rest of the garment falling off.

Lighting: Soft overcast wrap light. Subtle specular on the ribbed collar texture. No hard shadows.

Composition: Collar curve forms a gentle S-line across the frame. Button placket runs vertically through the lower half. Short-sleeve hem tucks into the upper-left corner. Dot pattern fills the remaining negative space.

Brand elements: Vindof polo craft elements — ribbed collar, dot pattern, button placket, sleeve hem — featured as hero detail. No logo overlay.

Mood: Quiet craft detail, restraint, quality-over-quantity Vindof brand value made visible.

No text in image.`,
	systemInstruction: `85mm tight crop close-up of a white ribbed collar meeting a red and white dot-pattern knit polo, with the short-sleeve hem visible in the frame corner. Overcast wrap light. Museum plaza blurred behind. Subtle S-curve composition. Quiet maximalism craft detail. Photorealistic.`,
	referenceImageIds: ["vindof-red-dot-polo", scene06ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-07",
});

const scene07ImageId = findImageIdByGeneration(scene07.id);
copyToAssets(scene07.id, "scene-07-b-detail-2");
results.push({
	scene: "07 — B Detail 2",
	genId: scene07.id,
	imageId: scene07ImageId,
	tokens: scene07.tokenUsage.totalTokens,
	file: "scene-07-b-detail-2.png",
});
console.log(
	`  ✓ Generated (${scene07.id}) — ${scene07.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 08: Character A Realization ───

console.log("\n═══ Generating Scene 08 — Character A Realization ═══\n");

const scene08 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The realization beat for Character A. He has heard the unfamiliar music, processed the pattern cuts, and now registers: these aren't his AirPods.

Subject: Extreme macro close-up on Character A's eyes only — Indian male, 20-22, white/fair skin tone. Both eyes visible, soft brown irises, catchlight from the overcast sky in each eye. Eyebrows slightly lifted in a restrained micro-reaction, eyes narrowing just a touch — the expression of someone clocking that something is off. Messy chestnut-brown curtain-bangs hair falling into the upper frame, partially visible. Light stubble on the upper lip just hinted at the bottom edge of frame if visible at all.

Environment: Background entirely out of focus — abstract soft blur of plaza tones.

Camera: 100mm macro focal length, extreme close-up, locked. Framing so eyes sit across the middle horizontal band of the frame.

Lighting: Soft diffused overcast wrap. Clean catchlight in the eyes from the open sky. Faintly warmer skin tone pickup against the cool plaza blur behind.

Composition: Eyes centered horizontally, slight rule-of-thirds offset vertically — eyes on the upper third line. Curtain-bang hair tips in the upper frame. Negative space across the lower third of the frame where only cheek and a soft out-of-focus smear of shirt color live.

Brand elements: None in this frame — this is a pure emotional beat.

Mood: Dawning recognition, restrained, micro-reaction. Calm intelligence registering a surprise without showing it fully.

No text in image.`,
	systemInstruction: `100mm macro extreme close-up on an Indian Gen Z male's eyes — the moment of dawning recognition. Subtle eye narrow, faint brow lift. Catchlight from overcast sky. Curtain-bangs hair falling into upper frame. Shallow DoF, background entirely abstract. Restrained micro-reaction. Photorealistic.`,
	referenceImageIds: [scene05ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-08",
});

const scene08ImageId = findImageIdByGeneration(scene08.id);
copyToAssets(scene08.id, "scene-08-a-realization");
results.push({
	scene: "08 — A Realization",
	genId: scene08.id,
	imageId: scene08ImageId,
	tokens: scene08.tokenUsage.totalTokens,
	file: "scene-08-a-realization.png",
});
console.log(
	`  ✓ Generated (${scene08.id}) — ${scene08.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 09: Character B Inserts Wrong Pair ───

console.log("\n═══ Generating Scene 09 — Character B Inserts Wrong Pair ═══\n");

const scene09 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Mirror beat to Character A's insert shot. Character B places the wrong AirPod into his right ear. Framing deliberately mirrors the earlier Character A insert scene for symmetry.

Subject: Character B, Indian male, 20-22, white/fair skin, lean build, messy tousled dark brown/black waves slightly longer than shoulder-length messy style, sharper jawline, clean-shaven, subtle confident resting expression, eyes neutral. His right hand raised, index finger and thumb placing a white AirPod Pro earbud into his right ear. The white ribbed collar of his Vindof red and white dot-pattern knit polo visible at his neck, with the red circle/dot pattern hinted at the lower edge of frame. Small gold hoop earring in his left ear just visible on the side of his head away from the earbud. Plain black cord necklace at the base of his neck.

Environment: Museum plaza entirely out of focus behind him — inverse angle to Character A's insert scene so the blurred architecture appears from the opposite direction.

Camera: 85mm portrait close-up, eye-level, 3/4 profile angle favoring Character B's left cheek toward camera with his right ear (where the earbud is being placed) also visible. Deliberate mirror framing to the earlier Character A insert shot.

Lighting: Soft overcast wrap light matching Scene 5 exactly. No hard shadows, gentle roll-off, faint eye catchlight.

Composition: Face fills the upper two-thirds of frame. Fingers + earbud in the lower-right quadrant (mirrors Character A's lower-left). Negative space camera-left.

Brand elements: White ribbed collar of Vindof polo visible at neck, hint of red dot pattern at lower edge. No logo overlay.

Mood: Neutral, pre-reaction, calm. Character B has not yet realized the music has changed.

No text in image.`,
	systemInstruction: `85mm portrait close-up of an Indian Gen Z male, 3/4 profile mirror-framed to an earlier scene, placing a white AirPod earbud into his right ear. Museum plaza blurred behind. Soft overcast wrap light on face. Neutral pre-reaction expression. Red and white dot-pattern polo collar visible. Shallow DoF.`,
	referenceImageIds: [scene01ImageId, "vindof-red-dot-polo"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-09",
});

const scene09ImageId = findImageIdByGeneration(scene09.id);
copyToAssets(scene09.id, "scene-09-b-inserts");
results.push({
	scene: "09 — B Inserts",
	genId: scene09.id,
	imageId: scene09ImageId,
	tokens: scene09.tokenUsage.totalTokens,
	file: "scene-09-b-inserts.png",
});
console.log(
	`  ✓ Generated (${scene09.id}) — ${scene09.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 10: Beat Drop → A Fit Detail 1 ───

console.log("\n═══ Generating Scene 10 — A Fit Detail 1 ═══\n");

const scene10 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The second beat drop. Music genre has just changed in Character B's ears because he's now listening through Character A's AirPods. Visual whip-cut to Character A's Vindof camp shirt graffiti print.

Subject: Macro extreme close-up of the front torso area of Character A's Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up shirt. The red graffiti-style spray-painted typography "THE LAZY BUNCH" dominates the frame along with three stylised illustrated character head portraits — one with a red bandana and headphones looking upward, one with taped-over glasses at a lower angle, one with a red cap and partial face covering. Washed-out cream fabric base with visible texture and subtle distress marks. Button placket running vertically through part of the composition. Portion of torso curvature apparent, conveying the shirt is on a body.

Environment: Museum plaza far behind, entirely out of focus — soft blur of pale grey and muted glass tones.

Camera: 100mm macro focal length, extreme shallow depth of field, quick whip-pan entry feel. Slightly off-axis framing — graphic print running at a subtle diagonal for visual energy rather than perfectly square on.

Lighting: Overcast wrap light. Slight specular on the fabric weave catching the diffused sky. No hard shadows.

Composition: Graffiti typography + character illustrations fill the frame, rotated 5-10 degrees off vertical for rhythm. Natural vignette at edges.

Brand elements: The Vindof "THE LAZY BUNCH" print is the entire subject — red spray-paint typography and three character-head illustrations must match the product reference exactly in style, color, placement, and line quality.

Mood: Beat-drop punch, graphic. Quiet Maximalism made loud for a single frame — the restrained character now wearing a loud print, rendered as hero detail.

No text in image aside from the garment's own printed graphic graffiti "THE LAZY BUNCH" typography which is part of the Vindof shirt design itself — this text is the physical garment print and must be preserved exactly as shown in the reference image.`,
	systemInstruction: `100mm macro close-up of a cream camp-collar shirt featuring red graffiti-style spray-paint typography "THE LAZY BUNCH" and three stylised illustrated character head portraits on the front. Museum plaza blurred far behind. Overcast diffused light. Slightly off-axis graphic framing. Photorealistic product accuracy.`,
	referenceImageIds: ["vindof-lazy-bunch-shirt", scene01ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-10",
});

const scene10ImageId = findImageIdByGeneration(scene10.id);
copyToAssets(scene10.id, "scene-10-a-detail-1");
results.push({
	scene: "10 — A Detail 1",
	genId: scene10.id,
	imageId: scene10ImageId,
	tokens: scene10.tokenUsage.totalTokens,
	file: "scene-10-a-detail-1.png",
});
console.log(
	`  ✓ Generated (${scene10.id}) — ${scene10.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 11: A Fit Detail 2 ───

console.log("\n═══ Generating Scene 11 — A Fit Detail 2 ═══\n");

const scene11 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Second beat-drop cut continuing the audio-swap visual moment. Detail shifts from the loud graffiti print to the craft element — the camp collar of Character A's Vindof shirt, worn slightly unbuttoned, with the interior Vindof neck label glimpsed.

Subject: Tight close-up on the camp-style spread collar of Character A's Vindof "THE LAZY BUNCH" cream short-sleeve shirt. Collar worn slightly unbuttoned, top button undone. Interior of collar shows the white woven "VINDOF" neck label with size tag. Cream/off-white fabric with subtle washed/distressed texture visible in the weave. A sliver of fair skin at the neckline visible. Portion of the red graffiti print just hinted at the lower edge of frame. No face visible — frame is tight on the collar detail.

Environment: Museum plaza heavily out of focus in the background.

Camera: 85mm focal length, very tight crop on the collar and neck area, shallow DoF — collar and neck label in sharp focus, rest of the garment falling off softly.

Lighting: Soft overcast wrap light. Subtle specular on the crisp collar edge. No hard shadows.

Composition: Camp collar curve runs diagonally across the frame. Top button area and the interior Vindof neck label sit just off-center. Hint of red graffiti print anchors the lower frame.

Brand elements: Vindof garment craft hero — collar construction, button quality, interior woven neck label with the word "VINDOF" on it visible as the brand moment.

Mood: Quiet craft detail, intentional restraint. The brand label is revealed subtly, not shouted.

No text in image aside from the interior Vindof neck label on the garment — this is the physical brand tag woven into the shirt and must be preserved as shown in the reference image. No overlay text.`,
	systemInstruction: `85mm tight crop close-up of a cream camp-collar shirt's collar and button — slightly unbuttoned — with the interior "VINDOF" neck label just visible. Washed cream fabric texture. Museum plaza blurred behind. Overcast wrap light. Subtle composition, quiet craft detail. Photorealistic.`,
	referenceImageIds: ["vindof-lazy-bunch-shirt", scene10ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-11",
});

const scene11ImageId = findImageIdByGeneration(scene11.id);
copyToAssets(scene11.id, "scene-11-a-detail-2");
results.push({
	scene: "11 — A Detail 2",
	genId: scene11.id,
	imageId: scene11ImageId,
	tokens: scene11.tokenUsage.totalTokens,
	file: "scene-11-a-detail-2.png",
});
console.log(
	`  ✓ Generated (${scene11.id}) — ${scene11.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 12: Character B Realization ───

console.log("\n═══ Generating Scene 12 — Character B Realization ═══\n");

const scene12 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Mirror realization beat to Character A's earlier one. Character B has heard the unfamiliar music and clocks the swap. A slightly warmer reaction — amusement behind the restraint.

Subject: Extreme macro close-up on Character B's eyes only — Indian male, 20-22, white/fair skin tone. Both eyes visible, soft dark-brown irises, sharp catchlight from the overcast sky. Eyebrows relaxed, eyes narrowing slightly in recognition, a faint smirk forming at the very bottom edge of frame where the upper lip just enters. Messy tousled dark brown/black waves slightly longer than Character A's style falling into the upper frame, partially visible.

Environment: Background entirely out of focus — abstract soft blur of plaza tones.

Camera: 100mm macro focal length, extreme close-up, locked. Framing deliberately mirrors Character A's realization shot so the two can cut together.

Lighting: Soft diffused overcast wrap, consistent with Character A's realization scene. Clean catchlight in the eyes.

Composition: Eyes centered horizontally, sitting on the upper third line. Dark wave hair in upper frame, hint of smirk at the bottom edge — the signature Quiet Maximalism micro-reaction.

Brand elements: None in this frame.

Mood: Recognition plus subtle amusement. Micro-smirk restrained — the moment a calm intelligence enjoys a small absurd discovery without performing it.

No text in image.`,
	systemInstruction: `100mm macro extreme close-up on an Indian Gen Z male's eyes — the moment of dawning recognition mirror to an earlier scene. Subtle eye narrow, faint smirk forming at the bottom of frame. Catchlight from overcast sky. Dark tousled waves falling into upper frame. Shallow DoF, abstract background.`,
	referenceImageIds: [scene09ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-12",
});

const scene12ImageId = findImageIdByGeneration(scene12.id);
copyToAssets(scene12.id, "scene-12-b-realization");
results.push({
	scene: "12 — B Realization",
	genId: scene12.id,
	imageId: scene12ImageId,
	tokens: scene12.tokenUsage.totalTokens,
	file: "scene-12-b-realization.png",
});
console.log(
	`  ✓ Generated (${scene12.id}) — ${scene12.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 13: Handoff (hands) ───

console.log("\n═══ Generating Scene 13 — Handoff ═══\n");

const scene13 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: The handoff. Both characters have realized the swap. Without speaking or fully turning toward each other, they exchange the correct AirPods palm-to-palm at the center of the frame.

Subject: Two hands meet at the exact center of frame, palm-open, exchanging white AirPod Pro earbuds. From the left, Character A's right hand enters — cream Vindof "THE LAZY BUNCH" camp-shirt short sleeve visible at the wrist with red graffiti-style typography and partial character-head print, fair-skinned forearm with 1-2 silver rings on the fingers, thin silver chain just visible at the edge of frame, palm open offering Character B's pair of AirPods. From the right, Character B's left hand enters — Vindof red and white dot-pattern knit polo short sleeve visible at the wrist with the white ribbed sleeve hem, fair-skinned forearm clean, palm open offering Character A's pair of AirPods. Two white AirPods in the air between the palms mid-exchange, or just settling into the receiving palms.

Environment: Museum plaza blurred behind the hands — soft architectural blur of pale stone and brushed steel.

Camera: 85mm focal length, medium close-up on hands and forearms, subtle dolly-in feel. Shallow depth of field — hands and AirPods razor sharp, everything beyond going soft.

Lighting: Soft overcast wrap light, consistent with the full sequence. Subtle sheen on the white AirPod casings. Shirt and polo sleeve patterns clearly lit.

Composition: Hands meet at exact center, forming a near-horizontal bridge across the frame. Cream + graffiti sleeve pattern on the left, red + white dot sleeve pattern on the right — the two Vindof pieces framed together as visual equals. AirPods in the negative space between palms. Background architectural blur as vertical structure behind.

Brand elements: Both Vindof garments share the frame equally, both patterns clearly legible. This is the moment the two pieces are visually paired. No logo overlay.

Mood: Silent understanding, quiet transaction, craft moment. No eye contact needed — the exchange itself is the conversation. Quiet Maximalism rendered as a gesture.

No text in image.`,
	systemInstruction: `85mm close-up of two hands meeting at the center of frame, exchanging white AirPod earbuds palm-to-palm. One sleeve shows a cream camp-collar shirt with red graffiti print, the other shows a red and white dot-pattern knit polo. Museum plaza blurred behind. Overcast wrap light. Silent craft moment. Photorealistic.`,
	referenceImageIds: [scene04ImageId, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-13",
});

const scene13ImageId = findImageIdByGeneration(scene13.id);
copyToAssets(scene13.id, "scene-13-handoff");
results.push({
	scene: "13 — Handoff",
	genId: scene13.id,
	imageId: scene13ImageId,
	tokens: scene13.tokenUsage.totalTokens,
	file: "scene-13-handoff.png",
});
console.log(
	`  ✓ Generated (${scene13.id}) — ${scene13.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 14: Walk Away ───

console.log("\n═══ Generating Scene 14 — Walk Away ═══\n");

const scene14 = await generate({
	prompt: `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.

Scene context: Final beat. Mirroring the establishing shot but in reverse — both characters now walking away from each other, backs to camera, each heading toward opposite edges of the plaza.

Subject: Wide full-body view of both Indian Gen Z male characters, backs to camera, walking away in opposite directions. Character A walking toward the left edge of frame — his back showing the cream Vindof "THE LAZY BUNCH" camp-shirt (any back-print if present, otherwise cream fabric with the collar visible), grey heather wide-leg baggy trousers, white low-top sneakers. Character B walking toward the right edge of frame — his back showing the red and white dot-pattern Vindof knit polo, black wide-leg baggy trousers, black leather loafers. Each with one white AirPod Pro in the correct ear (A in left, B in right) visible at a 3/4 angle as they walk. Same messy hairstyles as earlier scenes.

Environment: Same modern museum plaza as Scene 1. Polished pale grey stone floor, floor-to-ceiling glass + brushed steel facade behind, empty plaza.

Camera: 35mm focal length, eye-level, locked-off wide shot exactly matching the framing of Scene 1 so the two scenes feel like bookends. Characters fill the lower two-thirds, architecture fills the upper third.

Lighting: Same overcast midday diffusion. No hard shadows. Slight specular on the polished stone floor.

Composition: Symmetric — Character A exits toward the left third of frame, Character B exits toward the right third. Plaza negative space dominates the center. Glass facade vertical mullions frame the scene subtly. Final held beat.

Brand elements: Both Vindof garments visible from behind, both clearly identifiable. No logo overlay.

Mood: Quiet close, final held beat. No looking back. Quiet Maximalism restraint — the story ends as quietly as it began.

No text in image.`,
	systemInstruction: `35mm wide, locked-off final beat. Two Indian Gen Z males walking away from each other in opposite directions across an empty museum plaza, backs to camera, silhouetted against the pale glass facade. Overcast diffused daylight. Symmetric composition, plaza negative space dominant. Quiet maximalism close.`,
	referenceImageIds: [scene01ImageId, "vindof-lazy-bunch-shirt", "vindof-red-dot-polo"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-14",
});

const scene14ImageId = findImageIdByGeneration(scene14.id);
copyToAssets(scene14.id, "scene-14-walk-away");
results.push({
	scene: "14 — Walk Away",
	genId: scene14.id,
	imageId: scene14ImageId,
	tokens: scene14.tokenUsage.totalTokens,
	file: "scene-14-walk-away.png",
});
console.log(
	`  ✓ Generated (${scene14.id}) — ${scene14.tokenUsage.totalTokens} tokens`,
);

// ─── Summary ───

const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

console.log("\n═══════════════════════════════════════════════");
console.log("  GENERATION COMPLETE");
console.log("═══════════════════════════════════════════════\n");
console.log("| Scene | Generation ID | Tokens | File |");
console.log("|-------|--------------|--------|------|");
for (const r of results) {
	console.log(`| ${r.scene} | ${r.genId} | ${r.tokens} | ${r.file} |`);
}
console.log(`\nTotal tokens: ${totalTokens}`);
console.log(`Images copied to: ${ASSETS_DIR}/`);

// Output JSON for easy parsing
const outputJson = {
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
	`${ASSETS_DIR}/generation-log.json`,
	JSON.stringify(outputJson, null, 2),
);
console.log(
	`\nGeneration log saved to: ${ASSETS_DIR}/generation-log.json`,
);
