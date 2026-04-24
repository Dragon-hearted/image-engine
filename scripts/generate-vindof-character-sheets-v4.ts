/**
 * Vindof "Mirror Walk v4" Character Sheet Generator
 *
 * Replaces the legacy 6-file-per-character flow with a SINGLE composite image
 * per character on a white seamless studio backdrop. The composite contains
 * six panels (large face close-up, left profile, right profile, back-of-head,
 * full-body front, full-body back) — downstream scenes reference this one
 * image and the model pulls identity from whichever panel matches the scene's
 * camera angle.
 *
 * Model: gemini-3.1-flash-image-preview (Pro hits sustained 429s per project
 * memory — Flash is the correct channel for this composite).
 *
 * Implementation note: mirrors the helper/logging patterns of the legacy
 * script (generate-vindof-character-sheets.ts) but fans out characters in
 * parallel via Promise.allSettled. The prompt + system instruction are ported
 * verbatim from systems/scene-board/src/character-sheet-generator.ts.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-character-sheets-v4.ts
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

// ─── Model ───

const SHEET_MODEL: WisGateModel = "gemini-3.1-flash-image-preview";
const SHEET_ASPECT = "16:9" as const;
const SHEET_IMAGE_SIZE = "2K";
const SHEET_LAYOUT = "6-panel-composite-white-bg" as const;

// ─── Prompt strings (verbatim from scene-board/src/character-sheet-generator.ts) ───

const SYSTEM_INSTRUCTION =
	"Professional character reference sheet for storyboard continuity. Six-panel studio layout on a clean white seamless backdrop. Soft even studio lighting, 85mm equivalent, eye-level. The same character appears in every panel — preserve facial geometry, hair style + color, build, skin tone, and signature clothing exactly. Only the camera angle changes per panel. Editorial portrait photography, no text or labels.";

const LAYOUT_BODY =
	"Layout: a single wide image on a clean white seamless studio backdrop, showing the same character in six panels arranged as a reference sheet:\n" +
	"- A large close-up portrait of the face, facing camera head-on, neutral expression, eye contact with camera.\n" +
	"- A tight head-and-shoulders portrait in strict left profile (camera 90° to the subject's left side).\n" +
	"- A tight head-and-shoulders portrait in strict right profile (camera 90° to the subject's right side).\n" +
	"- A view from directly behind the head, showing hair and the back of the shoulders.\n" +
	"- A full-body front view: standing, arms relaxed at sides, facing camera head-on, neutral expression.\n" +
	"- A full-body back view: standing, facing directly away from camera, arms relaxed at sides, identical pose to the front view just rotated 180°.\n" +
	"\n" +
	"Every panel shares the same white seamless backdrop, the same soft key + fill lighting, and the same character — same hair, face, skin, build, and signature clothing. Only the camera angle changes between panels.\n" +
	"\n" +
	"No text in image. No labels between panels. No branding.";

// ─── Style anchor preamble (verbatim from legacy script L113) ───

const PREAMBLE = `Cinematic editorial photograph, moody overcast light, modern museum plaza exterior, pale polished stone floor, glass + brushed steel facade. Two Indian Gen Z males (fair skin, messy hair, 20-22). Desaturated cool palette with cream + sangria red accents. Shallow depth of field, 85mm macro feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical.`;

// ─── Locked descriptions (verbatim from legacy script L117/L119) ───

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
}

const characters: CharacterInput[] = [
	{
		slug: "character-a",
		name: "Character A",
		lockedDescription: CHAR_A_DESCRIPTION,
		sourceRefImageIds: ["vindof-lazy-bunch-shirt"],
		tags: ["protagonist", "vindof", "gen-z", "indian-male"],
		appearsInScenes: ["02", "03", "04", "05", "06", "11", "12", "13"],
	},
	{
		slug: "character-b",
		name: "Character B",
		lockedDescription: CHAR_B_DESCRIPTION,
		sourceRefImageIds: ["vindof-red-dot-polo"],
		tags: ["protagonist", "vindof", "gen-z", "indian-male"],
		appearsInScenes: ["02", "03", "04", "07", "08", "09", "12", "13"],
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

function buildPrompt(input: CharacterInput): string {
	const parts = [
		PREAMBLE.trim(),
		BRAND_CONTEXT.trim(),
		"",
		`Character reference sheet — ${input.name}. ${input.lockedDescription}`,
		"",
		LAYOUT_BODY,
	];
	return parts.join("\n");
}

interface SheetOutcome {
	slug: string;
	name: string;
	imageId?: string;
	imageUrl?: string;
	generationId?: string;
	model?: string;
	generatedAt?: string;
	tokens?: number;
	localPath?: string;
	error?: string;
	attempts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return /429|rate[\s-]?limit|too many requests/i.test(message);
}

/**
 * Generate a composite character sheet for one character. Retries up to 2
 * extra times on 429 with a 10s backoff between attempts. Returns a fully
 * populated outcome either way (with `error` on failure).
 */
async function generateCompositeSheet(
	input: CharacterInput,
): Promise<SheetOutcome> {
	const maxAttempts = 3; // initial + 2 retries on 429
	let attempts = 0;
	let lastError: unknown = null;

	while (attempts < maxAttempts) {
		attempts += 1;
		console.log(
			`\n  → ${input.slug} / composite sheet (attempt ${attempts}/${maxAttempts}, ${SHEET_MODEL})`,
		);
		try {
			const gen = await generate({
				prompt: buildPrompt(input),
				systemInstruction: SYSTEM_INSTRUCTION,
				referenceImageIds: input.sourceRefImageIds,
				aspectRatio: SHEET_ASPECT,
				imageSize: SHEET_IMAGE_SIZE,
				forceImage: true,
				model: SHEET_MODEL,
				sceneId: `${input.slug}:sheet`,
			});
			const row = findImageRowByGeneration(gen.id);

			// Copy composite into the client's character dir as `sheet.{ext}`.
			const charDir = `${CHARACTERS_DIR}/${input.slug}`;
			if (!existsSync(charDir)) mkdirSync(charDir, { recursive: true });
			const ext = row.mimeType === "image/jpeg" ? "jpg" : "png";
			const localPath = `${charDir}/sheet.${ext}`;
			const srcPath = row.path.startsWith("/")
				? row.path
				: `${process.cwd()}/${row.path.replace(/^\.\//, "")}`;
			copyFileSync(srcPath, localPath);

			console.log(
				`     ✓ generated (img ${row.id}, gen ${gen.id}) — ${gen.tokenUsage.totalTokens} tokens → ${localPath}`,
			);

			return {
				slug: input.slug,
				name: input.name,
				imageId: row.id,
				imageUrl: gen.imageUrl,
				generationId: gen.id,
				model: gen.model,
				generatedAt: gen.createdAt,
				tokens: gen.tokenUsage.totalTokens,
				localPath,
				attempts,
			};
		} catch (err) {
			lastError = err;
			const message = err instanceof Error ? err.message : String(err);
			console.error(`     ✗ attempt ${attempts} failed: ${message}`);
			if (isRateLimitError(err) && attempts < maxAttempts) {
				console.error(`       429 detected — backing off 10s before retry`);
				await sleep(10_000);
				continue;
			}
			break;
		}
	}

	const message =
		lastError instanceof Error ? lastError.message : String(lastError);
	return {
		slug: input.slug,
		name: input.name,
		error: message,
		attempts,
	};
}

// ─── Step 2: Fan out both characters in parallel ───

console.log("\n═══ Generating composite character sheets (parallel) ═══");

const settled = await Promise.allSettled(
	characters.map((c) => generateCompositeSheet(c)),
);

const outcomes: SheetOutcome[] = settled.map((s, idx) => {
	if (s.status === "fulfilled") return s.value;
	// Safety net — generateCompositeSheet catches internally, but if something
	// unexpected throws we still record a consistent outcome.
	const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
	return {
		slug: characters[idx].slug,
		name: characters[idx].name,
		error: reason,
		attempts: 0,
	};
});

const totalTokensUsed = outcomes.reduce((sum, o) => sum + (o.tokens ?? 0), 0);
const failedSlugs = outcomes.filter((o) => o.error).map((o) => o.slug);

// ─── Step 3: Results table ───

console.log("\n═══════════════════════════════════════════════");
console.log("  COMPOSITE SHEET RESULTS");
console.log("═══════════════════════════════════════════════\n");
console.log("| Slug          | Status   | Attempts | Tokens  | Image ID                              |");
console.log("|---------------|----------|----------|---------|---------------------------------------|");
for (const o of outcomes) {
	const status = o.error ? "✗ error" : "✓ ok";
	const id = o.imageId ?? o.error ?? "-";
	const tokens = o.tokens != null ? String(o.tokens) : "-";
	console.log(
		`| ${o.slug.padEnd(13)} | ${status.padEnd(8)} | ${String(o.attempts).padEnd(8)} | ${tokens.padEnd(7)} | ${id} |`,
	);
}
console.log(`\nTotal tokens used: ${totalTokensUsed}`);

// ─── Step 4: Per-character character.md + step 5: combined manifest ───

const generatedAtIso = new Date().toISOString();

interface ManifestCharacter {
	slug: string;
	name: string;
	sheetLayout: typeof SHEET_LAYOUT;
	sheet?: string;
}

const manifestCharacters: Record<string, ManifestCharacter> = {};

for (const input of characters) {
	const charDir = `${CHARACTERS_DIR}/${input.slug}`;
	if (!existsSync(charDir)) mkdirSync(charDir, { recursive: true });

	const o = outcomes.find((x) => x.slug === input.slug);
	const sheetForFrontmatter =
		o && !o.error && o.imageId
			? {
					imageId: o.imageId,
					imageUrl: o.imageUrl,
					model: o.model,
					generatedAt: o.generatedAt,
					localPath: o.localPath,
				}
			: null;

	manifestCharacters[input.slug] = {
		slug: input.slug,
		name: input.name,
		sheetLayout: SHEET_LAYOUT,
		...(sheetForFrontmatter && { sheet: sheetForFrontmatter.imageId }),
	};

	const frontmatter: Record<string, unknown> = {
		slug: input.slug,
		name: input.name,
		sheetLayout: SHEET_LAYOUT,
		lockedDescription: input.lockedDescription,
		sourceRefImageIds: input.sourceRefImageIds,
		tags: input.tags,
		appearsInScenes: input.appearsInScenes,
		usedInProjects: [PROJECT_NAME],
		createdAt: generatedAtIso,
		...(sheetForFrontmatter && { sheet: sheetForFrontmatter }),
	};

	const yamlBody = stringifyYaml(frontmatter).trimEnd();

	const failed = !!o?.error;
	const summaryBody = failed
		? `\n# ${input.name}\n\n_Composite character sheet generation failed._\n\n**Error:** ${o?.error}\n\nRetry by re-running the script. Locked description and source references are preserved above.\n`
		: `\n# ${input.name}\n\n${input.name} is a Vindof protagonist for the **${PROJECT_NAME}** storyboard. The single composite reference sheet above (rendered with ${SHEET_MODEL}, 6-panel white-seamless layout) locks identity across every scene this character appears in. Downstream scenes reference only \`sheet.png\` / \`sheet.jpg\`; Flash pulls whichever panel matches the scene's camera angle.\n\n**Wardrobe anchor:** ${input.sourceRefImageIds.join(", ")}\n\n**Appears in scenes:** ${input.appearsInScenes.join(", ")}\n`;

	const md = `---\n${yamlBody}\n---\n${summaryBody}`;
	await Bun.write(`${charDir}/character.md`, md);
	console.log(`\n  ✓ Wrote ${charDir}/character.md`);
}

const manifest = {
	client: "vindof",
	project: PROJECT_NAME,
	generatedAt: generatedAtIso,
	totalTokensUsed,
	failedCharacters: failedSlugs,
	characters: manifestCharacters,
};

await Bun.write(
	`${CHARACTERS_DIR}/manifest.json`,
	JSON.stringify(manifest, null, 2),
);
console.log(`\n  ✓ Wrote ${CHARACTERS_DIR}/manifest.json`);

// ─── Step 6: Generation log JSON ───

const generationLog = {
	version: "character-sheet-v4",
	project: PROJECT_NAME,
	model: SHEET_MODEL,
	sheetLayout: SHEET_LAYOUT,
	generatedAt: generatedAtIso,
	totalTokensUsed,
	failedCharacters: failedSlugs,
	outcomes: outcomes.map((o) => ({
		slug: o.slug,
		name: o.name,
		imageId: o.imageId,
		generationId: o.generationId,
		model: o.model,
		attempts: o.attempts,
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

// ─── Step 7: Summary + exit ───

console.log("\n═══════════════════════════════════════════════");
console.log("  V4 COMPOSITE SHEET GENERATION SUMMARY");
console.log("═══════════════════════════════════════════════\n");

if (failedSlugs.length > 0) {
	console.error(
		`  ✗ ${failedSlugs.length} character(s) failed: ${failedSlugs.join(", ")}`,
	);
	console.error(
		`    Re-run the script to retry. Per project memory, if Flash also 429s,`,
	);
	console.error(
		`    wait a few minutes — WisGate rate-limit windows recover quickly.`,
	);
	process.exit(1);
} else {
	console.log(
		`  ✓ All ${characters.length} characters generated cleanly (1 composite each, ${totalTokensUsed} tokens).`,
	);
	console.log(`  ✓ Manifest: ${CHARACTERS_DIR}/manifest.json`);
	for (const o of outcomes) {
		console.log(`    • ${o.slug}: ${o.imageId} → ${o.localPath}`);
	}
}

// ─── Minimal YAML stringifier (copied verbatim from legacy script) ───

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
	return JSON.stringify(s);
}
