/**
 * Vindof "Mirror Walk" Character Sheet Generator
 *
 * Generates Stage 4.5 character sheets for the airpods-swap-museum storyboard:
 *   Character A — cream Vindof "THE LAZY BUNCH" camp shirt
 *   Character B — Vindof red and white dot-pattern knit polo
 *
 * Per character, 6 views are emitted:
 *   body-front (anchor — gemini-3-pro-image-preview, 3:4)
 *     ├── body-back     (gemini-2.5-flash-image, 3:4)
 *     ├── face-front    (gemini-2.5-flash-image, 1:1)
 *     │     ├── face-left   (gemini-2.5-flash-image, 1:1)
 *     │     └── face-right  (gemini-2.5-flash-image, 1:1)
 *     └── (face-back chains off body-back, gemini-2.5-flash-image, 1:1)
 *
 * Implementation note: this script uses option (b) from the task spec — it
 * calls image-engine's in-process `executeGeneration` directly rather than
 * going through scene-board's HTTP `image-client`, so no separate server
 * needs to be running. The prompt construction (PREAMBLE + lockedDescription
 * + per-view framing + system instruction) mirrors the structure used by
 * `systems/scene-board/src/character-sheet-generator.ts` exactly.
 *
 * Outputs:
 *   - 12 portraits saved to systems/image-engine/uploads/{genId}.{png|jpg}
 *   - Each portrait copied to
 *       systems/scene-board/clients/vindof/characters/{slug}/{viewKey}.{ext}
 *   - One character.md per character with frontmatter (Stage 4.5 spec)
 *   - One combined manifest at .../characters/manifest.json
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-character-sheets.ts
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { insertImage, getImage, db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import type { WisGateModel } from "../src/types";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

// ─── Paths ───

const REPO_ROOT = "/Users/dragonhearted/Desktop/Adcelerate";
const STORYBOARD_DIR = `${REPO_ROOT}/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum`;
const CHARACTERS_DIR = `${REPO_ROOT}/systems/scene-board/clients/vindof/characters`;
const PROJECT_NAME = "airpods-swap-museum";

if (!existsSync("./uploads")) mkdirSync("./uploads");
if (!existsSync(CHARACTERS_DIR)) mkdirSync(CHARACTERS_DIR, { recursive: true });

// ─── Models ───

const ANCHOR_MODEL = "gemini-3-pro-image-preview" as const;
const CHAINED_MODEL = "gemini-2.5-flash-image" as const;
const ANCHOR_VIEW = "body-front" as const;

type CharacterViewKey =
	| "body-front"
	| "body-back"
	| "face-front"
	| "face-back"
	| "face-left"
	| "face-right";

const CHARACTER_VIEW_KEYS: readonly CharacterViewKey[] = [
	"body-front",
	"body-back",
	"face-front",
	"face-back",
	"face-left",
	"face-right",
] as const;

/** Which view each non-anchor view chains off (mirror of character-sheet-generator.ts). */
const VIEW_CHAIN: Record<
	Exclude<CharacterViewKey, typeof ANCHOR_VIEW>,
	CharacterViewKey
> = {
	"body-back": "body-front",
	"face-front": "body-front",
	"face-left": "face-front",
	"face-right": "face-front",
	"face-back": "body-back",
};

const VIEW_ASPECT: Record<CharacterViewKey, "3:4" | "1:1"> = {
	"body-front": "3:4",
	"body-back": "3:4",
	"face-front": "1:1",
	"face-back": "1:1",
	"face-left": "1:1",
	"face-right": "1:1",
};

const VIEW_FRAMING: Record<CharacterViewKey, string> = {
	"body-front":
		"Full body, standing, facing camera head-on, arms relaxed at sides, neutral expression.",
	"body-back":
		"Full body, standing, facing directly away from camera, arms relaxed at sides. Identical pose to the front view, just rotated 180°.",
	"face-front":
		"Tight head-and-shoulders portrait, facing camera head-on, neutral expression, eye contact with camera.",
	"face-left":
		"Tight head-and-shoulders portrait in strict left profile (camera positioned 90° to the subject's left side, subject looking forward, only the left side of the face visible).",
	"face-right":
		"Tight head-and-shoulders portrait in strict right profile (camera positioned 90° to the subject's right side, subject looking forward, only the right side of the face visible).",
	"face-back":
		"Tight head-and-shoulders portrait from directly behind, showing the back of the head, hair, and shoulders.",
};

const SYSTEM_INSTRUCTION =
	"Character reference sheet view for storyboard continuity. Neutral studio seamless backdrop (off-white to light gray). Soft large key + fill, 85mm equivalent, eye-level. The subject must be identical to the reference image — preserve facial geometry, hair style + color, build, skin tone, and signature clothing exactly. Only the camera angle changes. Style: editorial portrait photography.";

// ─── Style anchor preamble (verbatim from generate-vindof-mirror-walk-v2.ts L30) ───

const PREAMBLE = `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.`;

// ─── Locked descriptions (verbatim from generate-vindof-mirror-walk-v2.ts L34/L36) ───

const CHAR_A_DESCRIPTION = `Character A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof "THE LAZY BUNCH" cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear.`;

const CHAR_B_DESCRIPTION = `Character B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring in his left ear. One white AirPod Pro in his right ear.`;

const BRAND_CONTEXT =
	"Vindof — Quiet Maximalism. Calm self-possessed expression. Casual-effortless Gen Z styling — messy hair, baggy bottoms, intentional Vindof piece on top. Premium streetwear editorial portrait.";

// ─── Character inputs ───

interface CharacterInput {
	slug: string;
	name: string;
	lockedDescription: string;
	sourceRefImageIds: string[];
	tags: string[];
	appearsInScenes: string[];
	styleAnchor: string;
	brandContext: string;
}

const characters: CharacterInput[] = [
	{
		slug: "character-a",
		name: "Character A",
		lockedDescription: CHAR_A_DESCRIPTION,
		sourceRefImageIds: ["vindof-lazy-bunch-shirt"],
		tags: ["protagonist", "vindof", "gen-z", "indian-male"],
		appearsInScenes: ["02", "03", "04", "05", "06", "11", "12", "13"],
		styleAnchor: PREAMBLE,
		brandContext: BRAND_CONTEXT,
	},
	{
		slug: "character-b",
		name: "Character B",
		lockedDescription: CHAR_B_DESCRIPTION,
		sourceRefImageIds: ["vindof-red-dot-polo"],
		tags: ["protagonist", "vindof", "gen-z", "indian-male"],
		appearsInScenes: ["02", "03", "04", "07", "08", "09", "12", "13"],
		styleAnchor: PREAMBLE,
		brandContext: BRAND_CONTEXT,
	},
];

// ─── Step 1: Import product reference images (idempotent) ───

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
	insertImage({
		id: p.id,
		filename: p.path.split("/").pop()!,
		originalName: p.name,
		path: p.path,
		mimeType: p.mimeType,
		size: file.size,
		createdAt: new Date().toISOString(),
	});
	console.log(`  ✓ Imported ${p.name} (${p.id})`);
}

// ─── Helpers ───

interface ImageRow {
	id: string;
	filename: string;
	originalName: string;
	path: string;
	mimeType: string;
	size: number;
	createdAt: string;
}

/**
 * Find the images-table row id (and absolute file path) for a freshly produced
 * generation. `executeGeneration` writes one image row per generation with
 * filename = `{generationId}.{ext}` and a fresh UUID id; we look it up by
 * filename prefix.
 */
function findImageRowByGeneration(genId: string): ImageRow {
	const row = db
		.prepare("SELECT * FROM images WHERE filename LIKE ?")
		.get(`${genId}.%`) as ImageRow | null;
	if (!row) throw new Error(`No image row found for generation ${genId}`);
	return row;
}

function buildPrompt(
	input: CharacterInput,
	viewKey: CharacterViewKey,
): string {
	const framing = VIEW_FRAMING[viewKey];
	const parts = [
		input.styleAnchor.trim(),
		input.brandContext.trim(),
		"",
		`Character reference — ${input.name}. ${input.lockedDescription}`,
		"",
		`View: ${framing}`,
		"",
		"Backdrop: seamless neutral studio. Lighting: soft large key at 45°, fill at 1:2 ratio, subtle rim for separation. No props beyond signature clothing. No text in image.",
	];
	return parts.join("\n");
}

function sceneIdFor(slug: string, viewKey: CharacterViewKey): string {
	return `${slug}:${viewKey}`;
}

interface PortraitOutcome {
	slug: string;
	viewKey: CharacterViewKey;
	model: string;
	imageId?: string;
	imageUrl?: string;
	generationId?: string;
	generatedAt?: string;
	tokens?: number;
	localPath?: string;
	error?: string;
}

const outcomes: PortraitOutcome[] = [];
const abortedCharacters: string[] = [];
let totalTokensUsed = 0;

/**
 * Generates one portrait view. Records the outcome (success or per-view error)
 * into `outcomes`. Returns the resolved image-row id on success so chained
 * views can use it as `referenceImageIds`.
 */
async function generateView(
	input: CharacterInput,
	viewKey: CharacterViewKey,
	referenceImageIds: string[],
	model: WisGateModel,
): Promise<string | null> {
	console.log(`\n  → ${input.slug} / ${viewKey} (${model})`);
	try {
		const gen = await generate({
			prompt: buildPrompt(input, viewKey),
			systemInstruction: SYSTEM_INSTRUCTION,
			referenceImageIds,
			aspectRatio: VIEW_ASPECT[viewKey],
			imageSize: "2K",
			forceImage: true,
			model,
			sceneId: sceneIdFor(input.slug, viewKey),
		});
		const row = findImageRowByGeneration(gen.id);

		// Copy to the client's character directory.
		const charDir = `${CHARACTERS_DIR}/${input.slug}`;
		if (!existsSync(charDir)) mkdirSync(charDir, { recursive: true });
		const ext = row.mimeType === "image/jpeg" ? "jpg" : "png";
		const localPath = `${charDir}/${viewKey}.${ext}`;
		// `row.path` is the absolute path written by executeGeneration
		// (relative `./uploads/...` when run from image-engine cwd, so we
		// resolve it against cwd if not absolute).
		const srcPath = row.path.startsWith("/")
			? row.path
			: `${process.cwd()}/${row.path.replace(/^\.\//, "")}`;
		copyFileSync(srcPath, localPath);

		totalTokensUsed += gen.tokenUsage.totalTokens;

		outcomes.push({
			slug: input.slug,
			viewKey,
			model: gen.model,
			imageId: row.id,
			imageUrl: gen.imageUrl,
			generationId: gen.id,
			generatedAt: gen.createdAt,
			tokens: gen.tokenUsage.totalTokens,
			localPath,
		});

		console.log(
			`     ✓ generated (img ${row.id}, gen ${gen.id}) — ${gen.tokenUsage.totalTokens} tokens → ${localPath}`,
		);
		return row.id;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		outcomes.push({
			slug: input.slug,
			viewKey,
			model,
			error: message,
		});
		console.error(`     ✗ failed: ${message}`);
		return null;
	}
}

// ─── Step 2: Generate all 6 views per character (sequential by char, chained within) ───

console.log("\n═══ Generating character sheets ═══");

for (const input of characters) {
	console.log(
		`\n─── ${input.name} (${input.slug}) — anchor + 5 chained views ───`,
	);

	// Anchor view (Pro, references product photo)
	const anchorImageId = await generateView(
		input,
		ANCHOR_VIEW,
		input.sourceRefImageIds,
		ANCHOR_MODEL,
	);

	if (!anchorImageId) {
		console.error(
			`\n  ⚠  Anchor view failed for ${input.slug} — skipping all 5 dependent views.`,
		);
		abortedCharacters.push(input.slug);
		// Record the 5 dependent views as aborted so the manifest/log is complete.
		for (const viewKey of CHARACTER_VIEW_KEYS) {
			if (viewKey === ANCHOR_VIEW) continue;
			outcomes.push({
				slug: input.slug,
				viewKey,
				model: CHAINED_MODEL,
				error: "Skipped — anchor view failed",
			});
		}
		continue;
	}

	// Track the resolved image-id per view for in-character chaining.
	const resolvedByView: Partial<Record<CharacterViewKey, string>> = {
		[ANCHOR_VIEW]: anchorImageId,
	};

	// Chained views — must be done in dependency order:
	// body-back ← body-front
	// face-front ← body-front
	// face-back ← body-back
	// face-left ← face-front
	// face-right ← face-front
	const chainOrder: Exclude<CharacterViewKey, typeof ANCHOR_VIEW>[] = [
		"body-back",
		"face-front",
		"face-back",
		"face-left",
		"face-right",
	];

	for (const viewKey of chainOrder) {
		const parentView = VIEW_CHAIN[viewKey];
		const parentImageId = resolvedByView[parentView];
		if (!parentImageId) {
			outcomes.push({
				slug: input.slug,
				viewKey,
				model: CHAINED_MODEL,
				error: `Skipped — parent view ${parentView} unavailable`,
			});
			console.error(
				`     ✗ ${viewKey} skipped — parent ${parentView} unavailable`,
			);
			continue;
		}
		const childImageId = await generateView(
			input,
			viewKey,
			[parentImageId],
			CHAINED_MODEL,
		);
		if (childImageId) resolvedByView[viewKey] = childImageId;
	}
}

// ─── Step 3: Per-view results table ───

console.log("\n═══════════════════════════════════════════════");
console.log("  PER-VIEW RESULTS");
console.log("═══════════════════════════════════════════════\n");
console.log("| Slug          | View        | Model                          | Status   | Image ID |");
console.log("|---------------|-------------|--------------------------------|----------|----------|");
for (const o of outcomes) {
	const status = o.error ? "✗ error" : "✓ ok";
	const id = o.imageId ?? o.error ?? "-";
	console.log(
		`| ${o.slug.padEnd(13)} | ${o.viewKey.padEnd(11)} | ${o.model.padEnd(30)} | ${status.padEnd(8)} | ${id} |`,
	);
}
console.log(`\nTotal tokens used: ${totalTokensUsed}`);

// ─── Step 4: Per-character character.md + step 5: combined manifest ───

const generatedAtIso = new Date().toISOString();

interface ManifestCharacter {
	slug: string;
	name: string;
	anchorView: CharacterViewKey;
	portraits: Partial<Record<CharacterViewKey, string>>;
}

const manifestCharacters: Record<string, ManifestCharacter> = {};

for (const input of characters) {
	const charDir = `${CHARACTERS_DIR}/${input.slug}`;
	if (!existsSync(charDir)) mkdirSync(charDir, { recursive: true });

	const charOutcomes = outcomes.filter((o) => o.slug === input.slug);
	const portraitsForFrontmatter: Record<string, unknown> = {};
	const portraitsForManifest: Partial<Record<CharacterViewKey, string>> = {};

	for (const viewKey of CHARACTER_VIEW_KEYS) {
		const o = charOutcomes.find((x) => x.viewKey === viewKey);
		if (!o || o.error || !o.imageId) continue;
		portraitsForFrontmatter[viewKey] = {
			imageId: o.imageId,
			imageUrl: o.imageUrl,
			model: o.model,
			generatedAt: o.generatedAt,
			localPath: o.localPath,
		};
		portraitsForManifest[viewKey] = o.imageId;
	}

	manifestCharacters[input.slug] = {
		slug: input.slug,
		name: input.name,
		anchorView: ANCHOR_VIEW,
		portraits: portraitsForManifest,
	};

	const frontmatter = {
		slug: input.slug,
		name: input.name,
		anchorView: ANCHOR_VIEW,
		lockedDescription: input.lockedDescription,
		sourceRefImageIds: input.sourceRefImageIds,
		tags: input.tags,
		appearsInScenes: input.appearsInScenes,
		usedInProjects: [PROJECT_NAME],
		createdAt: generatedAtIso,
		portraits: portraitsForFrontmatter,
	};

	const yamlBody = stringifyYaml(frontmatter).trimEnd();

	const aborted = abortedCharacters.includes(input.slug);
	const summaryBody = aborted
		? `\n# ${input.name}\n\n_Character sheet generation was aborted — anchor view (\`body-front\`) failed._\n\nRetry by re-running the script for this character once the upstream model (\`${ANCHOR_MODEL}\`) is available again. Locked description and source references are preserved above.\n`
		: `\n# ${input.name}\n\n${input.name} is a Vindof protagonist for the **${PROJECT_NAME}** storyboard. The 6-view reference sheet above (anchor: \`body-front\` rendered with NanoBanana Pro, 5 chained views with NanoBanana Flash) locks identity across every scene this character appears in.\n\n**Wardrobe anchor:** ${input.sourceRefImageIds.join(", ")}\n\n**Appears in scenes:** ${input.appearsInScenes.join(", ")}\n`;

	const md = `---\n${yamlBody}\n---\n${summaryBody}`;
	await Bun.write(`${charDir}/character.md`, md);
	console.log(`\n  ✓ Wrote ${charDir}/character.md`);
}

const manifest = {
	client: "vindof",
	project: PROJECT_NAME,
	generatedAt: generatedAtIso,
	totalTokensUsed,
	abortedCharacters,
	characters: manifestCharacters,
};

await Bun.write(
	`${CHARACTERS_DIR}/manifest.json`,
	JSON.stringify(manifest, null, 2),
);
console.log(`\n  ✓ Wrote ${CHARACTERS_DIR}/manifest.json`);

// ─── Step 6: Generation log JSON (mirrors v2.ts pattern) ───

const generationLog = {
	version: "character-sheet-v1",
	project: PROJECT_NAME,
	generatedAt: generatedAtIso,
	totalTokensUsed,
	abortedCharacters,
	outcomes: outcomes.map((o) => ({
		slug: o.slug,
		viewKey: o.viewKey,
		model: o.model,
		imageId: o.imageId,
		generationId: o.generationId,
		tokens: o.tokens,
		localPath: o.localPath,
		error: o.error,
	})),
};

await Bun.write(
	`${CHARACTERS_DIR}/generation-log.json`,
	JSON.stringify(generationLog, null, 2),
);
console.log(`  ✓ Wrote ${CHARACTERS_DIR}/generation-log.json`);

// ─── Step 7: Exit non-zero on aborted anchors ───

console.log("\n═══════════════════════════════════════════════");
console.log("  CHARACTER SHEET GENERATION SUMMARY");
console.log("═══════════════════════════════════════════════\n");

if (abortedCharacters.length > 0) {
	console.error(
		`  ✗ ${abortedCharacters.length} character(s) aborted: ${abortedCharacters.join(", ")}`,
	);
	console.error(
		`    The anchor view (body-front, ${ANCHOR_MODEL}) failed for the above. Per project memory,`,
	);
	console.error(
		`    WisGate routes Gemini 3 Pro through a sustained-429 endpoint — wait a few minutes and`,
	);
	console.error(
		`    re-run the script. To retry only the aborted character(s), edit the \`characters\` array`,
	);
	console.error(
		`    near the top of this file to include just the failed slug(s) and re-run.`,
	);
	console.error(
		`\n    DO NOT swap in gemini-2.5-flash-image as the anchor — that's a separate fallback path`,
	);
	console.error(
		`    handled by the Stage 4.5 generator, not this script.`,
	);
	process.exit(1);
} else {
	console.log(
		`  ✓ All ${characters.length} characters generated cleanly (${characters.length * 6} portraits, ${totalTokensUsed} tokens).`,
	);
	console.log(`  ✓ Manifest: ${CHARACTERS_DIR}/manifest.json`);
}

// ─── Minimal YAML stringifier ───
//
// We avoid a yaml dep — the frontmatter shape is predictable (string scalars,
// arrays of strings, and one nested map of view → portrait object). Any
// quotes/newlines in scalar values are escaped via JSON.stringify (which
// produces a valid YAML double-quoted string).

function stringifyYaml(obj: Record<string, unknown>, indent = 0): string {
	const pad = "  ".repeat(indent);
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined) continue;
		if (value === null) {
			lines.push(`${pad}${key}: null`);
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${pad}${key}: []`);
			} else {
				lines.push(`${pad}${key}:`);
				for (const item of value) {
					lines.push(`${pad}  - ${yamlScalar(item)}`);
				}
			}
			continue;
		}
		if (typeof value === "object") {
			const keys = Object.keys(value as Record<string, unknown>);
			if (keys.length === 0) {
				lines.push(`${pad}${key}: {}`);
			} else {
				lines.push(`${pad}${key}:`);
				lines.push(stringifyYaml(value as Record<string, unknown>, indent + 1));
			}
			continue;
		}
		lines.push(`${pad}${key}: ${yamlScalar(value)}`);
	}

	return lines.join("\n");
}

function yamlScalar(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	const s = String(value);
	// Use double-quoted form via JSON.stringify so embedded quotes/newlines/
	// special chars are safe. JSON's escaping is a strict subset of YAML's
	// double-quoted scalar escaping, so this is always valid.
	return JSON.stringify(s);
}

