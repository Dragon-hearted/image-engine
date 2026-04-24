/**
 * Storyboard Scene Generator — 1 Base, 3 Quiet Moves v3
 *
 * Generates all scenes sequentially with proper reference chaining
 * for consistent model and background across frames.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-storyboard-scenes.ts
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { insertImage, getImage, db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import type { GenerationResult } from "../src/types";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_ASSETS =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/1-base-3-quiet-moves-assets";

// Ensure uploads dir exists
if (!existsSync("./uploads")) mkdirSync("./uploads");

// ─── Step 1: Import product reference images ───

const productImages = [
	{
		id: "product-shirt1-black",
		path: `${STORYBOARD_ASSETS}/product-shirt1-black-textured.jpg`,
		name: "Vindof Shirt 1 - Black Textured Camp Collar",
	},
	{
		id: "product-shirt2-renaissance",
		path: `${STORYBOARD_ASSETS}/product-shirt2-renaissance.jpg`,
		name: "Vindof Shirt 2 - Renaissance Painting Print",
	},
	{
		id: "product-shirt3-botanical",
		path: `${STORYBOARD_ASSETS}/product-shirt3-botanical-stripe.jpg`,
		name: "Vindof Shirt 3 - Blue Striped Botanical Orchid",
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
		mimeType: "image/jpeg",
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
	const dest = `${STORYBOARD_ASSETS}/${sceneName}.${ext}`;
	copyFileSync(src, dest);
	return dest;
}

// ─── Scene Definitions ───

const STYLE_PREAMBLE =
	"Cinematic editorial fashion photograph. Art gallery setting with clean walls and gallery track lighting. Fair-skinned Indian male model with messy dark hair, calm expression. White vest and white oversized wide-leg pants as base. Moody directional lighting, soft shadows, warm concrete tones. Centered medium-full framing, eye-level. Quiet maximalism aesthetic — intentional, layered, unhurried.";

const results: {
	scene: string;
	genId: string;
	imageId: string;
	tokens: number;
	file: string;
}[] = [];

// ─── Scene 01: Base Reveal (ANCHOR) ───

console.log("\n═══ Generating Scene 01 — Base Reveal (anchor) ═══\n");

const scene01 = await generate({
	prompt: `${STYLE_PREAMBLE}

A young fair-skinned Indian man with messy textured dark brown hair stands centered in a contemporary art gallery. He wears a fitted white ribbed knit vest tucked loosely into white oversized wide-leg trousers. Barefoot. Hands resting in trouser pockets. Calm, self-possessed expression — present, not performing.

The gallery has clean off-white walls. A large abstract sculptural installation sits behind him to the left — dark metal, geometric, museum-grade. Polished warm concrete floor with subtle reflections. Gallery track lighting from above-left casts a warm directional pool on the model, soft shadows fall to his right. The background dims slightly into shadow.

Medium-full shot from head to bare feet, eye-level, centered composition. Model fills center third. Generous negative space on both sides. 9:16 vertical framing.

No text in image.`,
	systemInstruction:
		"Generate a cinematic editorial fashion photograph in a contemporary art gallery. Fair-skinned Indian male model, Gen Z aesthetic. Moody directional gallery track lighting with warm shadows. Quiet maximalism — intentional, unhurried, sculptural.",
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	sceneId: "scene-01",
});

const scene01ImageId = findImageIdByGeneration(scene01.id);
copyToAssets(scene01.id, "scene-01-base-reveal");
results.push({
	scene: "01 — Base Reveal",
	genId: scene01.id,
	imageId: scene01ImageId,
	tokens: scene01.tokenUsage.totalTokens,
	file: "scene-01-base-reveal.png",
});
console.log(
	`  ✓ Generated (${scene01.id}) — ${scene01.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 02: Empty Gallery Beat ───

console.log("\n═══ Generating Scene 02 — Empty Gallery Beat ═══\n");

const scene02 = await generate({
	prompt: `${STYLE_PREAMBLE}

The same contemporary art gallery, now empty. Clean off-white walls. The same large abstract sculptural installation sits to the left — dark metal, geometric, museum-grade. Polished warm concrete floor with subtle reflections. Gallery track lighting from above-left casts warm directional pools onto the empty floor where the model previously stood. Soft shadows create depth.

Same centered framing — the space is composed, not accidental. The gallery architecture and sculpture hold the frame. A breath of negative space. 9:16 vertical framing.

No text in image.`,
	systemInstruction:
		"Generate a cinematic photograph of an empty contemporary art gallery interior. Moody directional track lighting, warm concrete tones. The space feels curated and intentional, holding visual weight alone.",
	referenceImageIds: [scene01ImageId],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	sceneId: "scene-02",
});

const scene02ImageId = findImageIdByGeneration(scene02.id);
copyToAssets(scene02.id, "scene-02-empty-gallery");
results.push({
	scene: "02 — Empty Gallery",
	genId: scene02.id,
	imageId: scene02ImageId,
	tokens: scene02.tokenUsage.totalTokens,
	file: "scene-02-empty-gallery.png",
});
console.log(
	`  ✓ Generated (${scene02.id}) — ${scene02.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 03: Shirt 1 "found" ───

console.log('\n═══ Generating Scene 03 — Shirt 1: "found" ═══\n');

const scene03 = await generate({
	prompt: `${STYLE_PREAMBLE}

The same young fair-skinned Indian man from the reference image stands centered in the same gallery. He now wears a black oversized camp collar short-sleeve shirt, worn completely open and unbuttoned over the white ribbed knit vest and white wide-leg trousers. The shirt has a subtle tonal textured pattern — abstract leaf and organic shapes woven tone-on-tone into the black fabric, only visible when directional light catches the surface. Matte finish. Boxy relaxed fit. One hand adjusts the shirt hem casually.

The black shirt contrasts sharply against the white base and neutral gallery. The layering reads immediately — white vest visible underneath, black shirt open and relaxed. The tonal texture pattern catches gallery track lighting from above-left, revealing its depth.

Same gallery — off-white walls, same dark metal sculpture behind-left, polished warm concrete floor. Same track lighting. Same centered medium-full framing at eye-level. 9:16 vertical.

Mood: the first discovery. Something found, not forced.

No text in image.`,
	systemInstruction:
		"Generate a cinematic editorial fashion photograph in an art gallery. Fair-skinned Indian male model wearing a black textured open shirt over a white base outfit. Match the gallery setting and model from the reference image exactly. Moody gallery lighting.",
	referenceImageIds: [scene01ImageId, "product-shirt1-black"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-03",
});

const scene03ImageId = findImageIdByGeneration(scene03.id);
copyToAssets(scene03.id, "scene-03-shirt1-found");
results.push({
	scene: '03 — Shirt 1 "found"',
	genId: scene03.id,
	imageId: scene03ImageId,
	tokens: scene03.tokenUsage.totalTokens,
	file: "scene-03-shirt1-found.png",
});
console.log(
	`  ✓ Generated (${scene03.id}) — ${scene03.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 05: Shirt 2 "layered" ───

console.log('\n═══ Generating Scene 05 — Shirt 2: "layered" ═══\n');

const scene05 = await generate({
	prompt: `${STYLE_PREAMBLE}

The same young fair-skinned Indian man from the reference image stands centered in the same gallery. He now wears a camp collar short-sleeve shirt with a full Renaissance painting all-over print — a classical figure on a rearing white horse against a dramatic sky of dusty blue and cream clouds, with terracotta-red flowing robes. The print covers the entire shirt surface. Decorative buttons. Worn completely open and unbuttoned over the white ribbed knit vest and white wide-leg trousers. The dramatic, colorful print makes this shirt visually richer than the previous black shirt.

The Renaissance print catches gallery track lighting beautifully — blues, terracottas, and cream tones in the fabric play against the neutral gallery walls and white base outfit. The classical art print in a gallery setting creates visual irony — art on art.

Same gallery — off-white walls, same dark metal sculpture behind-left, polished warm concrete floor. Same track lighting from above-left. Same centered medium-full framing at eye-level. 9:16 vertical.

Mood: building, layering. Each choice adds depth without adding noise.

No text in image.`,
	systemInstruction:
		"Generate a cinematic editorial fashion photograph in an art gallery. Fair-skinned Indian male model wearing a Renaissance painting print shirt open over white base. Match the gallery setting and model from the reference image exactly. Moody gallery lighting.",
	referenceImageIds: [scene01ImageId, "product-shirt2-renaissance"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-05",
});

const scene05ImageId = findImageIdByGeneration(scene05.id);
copyToAssets(scene05.id, "scene-05-shirt2-layered");
results.push({
	scene: '05 — Shirt 2 "layered"',
	genId: scene05.id,
	imageId: scene05ImageId,
	tokens: scene05.tokenUsage.totalTokens,
	file: "scene-05-shirt2-layered.png",
});
console.log(
	`  ✓ Generated (${scene05.id}) — ${scene05.tokenUsage.totalTokens} tokens`,
);

// ─── Scene 07: Shirt 3 "considered" ───

console.log('\n═══ Generating Scene 07 — Shirt 3: "considered" ═══\n');

const scene07 = await generate({
	prompt: `${STYLE_PREAMBLE}

The same young fair-skinned Indian man from the reference image stands centered in the same gallery. He now wears a camp collar short-sleeve shirt with blue-and-white vertical stripes and a large botanical orchid print — cream and ivory orchid flowers with dark green leaves and a brown stem, overlaid directly on the striped fabric. Worn completely open and unbuttoned over the white ribbed knit vest and white wide-leg trousers. This is the hero look — the most visually distinctive of the three shirts. Slight head tilt, holding the pose with quiet confidence.

The blue-white stripes and botanical print bring the most color and visual complexity. The green, cream, and blue tones harmonize with the gallery's warm neutrals. The botanical motif in a gallery setting reads as curated.

Same gallery — off-white walls, same dark metal sculpture behind-left, polished warm concrete floor. Same track lighting from above-left, catching the striped fabric texture. Same centered medium-full framing at eye-level. 9:16 vertical.

Mood: the most intentional choice. Considered. Assured. This is the piece with a reason.

No text in image.`,
	systemInstruction:
		"Generate a cinematic editorial fashion photograph in an art gallery. Fair-skinned Indian male model wearing a blue-white striped botanical print shirt open over white base. This is the hero moment. Match the gallery and model from the reference image. Moody gallery lighting.",
	referenceImageIds: [scene01ImageId, "product-shirt3-botanical"],
	aspectRatio: "9:16",
	imageSize: "2K",
	forceImage: true,
	model: "gemini-2.5-flash-image",
	sceneId: "scene-07",
});

const scene07ImageId = findImageIdByGeneration(scene07.id);
copyToAssets(scene07.id, "scene-07-shirt3-considered");
results.push({
	scene: '07 — Shirt 3 "considered"',
	genId: scene07.id,
	imageId: scene07ImageId,
	tokens: scene07.tokenUsage.totalTokens,
	file: "scene-07-shirt3-considered.png",
});
console.log(
	`  ✓ Generated (${scene07.id}) — ${scene07.tokenUsage.totalTokens} tokens`,
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
console.log(`Images copied to: ${STORYBOARD_ASSETS}/`);

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
	`${STORYBOARD_ASSETS}/generation-log-v3.json`,
	JSON.stringify(outputJson, null, 2),
);
console.log(
	`\nGeneration log saved to: ${STORYBOARD_ASSETS}/generation-log-v3.json`,
);
