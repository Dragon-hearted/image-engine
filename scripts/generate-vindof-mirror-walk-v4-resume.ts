/**
 * Vindof Mirror Walk v4 Storyboard — RESUME script.
 *
 * Context: v4 batch succeeded for scenes 01-10 but failed terminally for
 * scenes 11, 12, 13 with a WisGate 401 that later cleared (confirmed via
 * check-wisgate-balance.ts — the key is ACTIVE with cash balance).
 *
 * This script re-runs ONLY scenes 11, 12, 13, with 3 attempts and 15s
 * backoff per scene. Env-anchor imageIds (S02/S05/S10) are hardcoded from
 * the existing generation-log-v4.json so we do not depend on the runtime
 * envMap. On success:
 *   - the generated image is copied to assets-v4/{filename}
 *   - the matching entry in generation-log-v4.json is UPDATED IN PLACE
 *     (no new entry appended) with imageId/generationId/tokens/references
 *   - successCount / failCount / totalTokens are recomputed from scenes[]
 *
 * If a scene still 401s after 3 attempts, the run STOPS — we do not keep
 * hammering. A human decides next step.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-mirror-walk-v4-resume.ts
 */

import {
	existsSync,
	mkdirSync,
	copyFileSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_DIR =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum";
const ASSETS_DIR = `${STORYBOARD_DIR}/assets-v4`;
const LOG_PATH = `${STORYBOARD_DIR}/generation-log-v4.json`;
const MODEL = "gemini-3.1-flash-image-preview";

if (!existsSync("./uploads")) mkdirSync("./uploads");
if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

const CHAR_A_SHEET_ID = "c3108268-46de-4343-8d66-9966bd54c495";
const CHAR_B_SHEET_ID = "28004f1e-7bc7-47e7-a5c0-e4c81aa15f95";

// Env-anchor imageIds — parsed from the existing v4 log, hardcoded here so
// we do not need to replay upstream scenes.
const S02_IMAGE_ID = "8f9b59f7-b319-4eb8-a5a4-3a3f8fa52556"; // Convergence Walk-in
const S05_IMAGE_ID = "332cf903-7a89-4d04-a6f0-8553003a8099"; // Pickup Swap
const S10_IMAGE_ID = "dc65a572-2136-4c00-bab8-0f99f5f9d2ea"; // A Fit Detail 1

const PREAMBLE = `[STYLE ANCHOR] Cinematic editorial photograph. Premium streetwear brand. Refined modern museum plaza exterior — clean geometric facade, polished pale grey stone floor, floor-to-ceiling glass + brushed steel, empty plaza, no street clutter. Overcast diffused daylight, ~5500K, soft wrap, no hard shadows. Two Indian Gen Z males, fair skin, messy textured hair, 20-22. Desaturated cool slate palette with cream + sangria red accents. Shallow DoF, 85mm feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical. Photorealistic.`;

interface SceneSpec {
	id: string;
	name: string;
	systemInstruction: string;
	prompt: string;
	referenceImageIds: string[];
	filename: string;
	dependsOn?: string;
}

// Scenes 11, 12, 13 — prompts/systemInstructions copied VERBATIM from
// generate-vindof-mirror-walk-v4.ts. Reference labels are pre-resolved to
// the concrete ids (char sheets + hardcoded env-anchor imageIds + product
// id strings that already exist as image rows in the db).
const SCENES: SceneSpec[] = [
	{
		id: "11",
		name: "A Fit Detail 2",
		systemInstruction: `85mm tight crop. Cream camp-collar curve, top button undone, interior woven VINDOF neck label just visible at the inside neckline. Washed cream fabric texture with subtle distress. Museum plaza blurred behind. Overcast wrap light. Subtle composition. Label text is physical woven garment detail, not overlay. Spelling: VINDOF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Tight crop of the Vindof cream camp-collar shirt's collar and top-button region on Character A's neck and upper chest. No face. No hands.\n[PRODUCT ACCURACY — PRIMARY REFERENCE] Camp-collar curves diagonally across the frame. Top button is undone. Interior woven "VINDOF" neck label is visible on the inside of the collar — physical brand tag, match reference exactly (label shape, typography, stitching). Cream fabric has subtle wash/distress texture. Top of chest and base of neck skin (fair Indian skin tone) in lower portion of frame.\n[COMPOSITION] 85mm tight crop. Collar curve runs diagonally from upper-left to lower-right. Top button undone, button placket visible. Interior neck label peeks out at the back of the collar. Shallow DoF, plaza far blurred.\n[LIGHTING] Overcast wrap light. Subtle shadow under collar curve.\n[MOOD] Quiet craft detail — brand moment revealed subtly, not shouted.\n[CONSTRAINTS] Interior "VINDOF" neck label is physical garment detail — match product reference exactly. Only scene besides Scene 10 where physical garment text is permitted. Spelling: VINDOF. No face shown. No overlay text.`,
		referenceImageIds: [
			"vindof-lazy-bunch-shirt",
			CHAR_A_SHEET_ID,
			S10_IMAGE_ID,
		],
		filename: "v4-scene-11-a-detail-2.png",
		dependsOn: "10",
	},
	{
		id: "12",
		name: "Handoff GROUNDED",
		systemInstruction: `85mm close-up. Two hands meeting at chest level in the center of frame, exchanging white AirPod Pro earbuds palm-to-palm. CRITICAL: the composition includes the PLAZA FLOOR AND LOWER LEGS — lower third of frame shows pale grey stone floor + both characters' lower legs, ankles, and shoes. Upper two-thirds show the hands exchange at chest level. Cream graffiti sleeve from screen-left; red dot polo sleeve from screen-right. Overcast wrap. Shallow DoF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Two hands meeting at the horizontal center of the frame at chest level, exchanging white AirPod Pro earbuds palm-to-palm. Character A's hand enters from SCREEN-LEFT — visible cream camp-collar shirt sleeve with red graffiti typography. Character B's hand enters from SCREEN-RIGHT — visible red and white dot-pattern polo sleeve.\n[GROUNDING — CRITICAL COMPOSITION RULE] The shot MUST be visually grounded with the plaza floor in frame. The frame is divided into thirds:\n- LOWER THIRD: polished pale grey stone plaza floor. Both characters' lower legs, ankles, and shoes are visible — Character A's grey heather wide-leg trouser hem + clean white low-top sneakers on the LEFT side of frame; Character B's black wide-leg trouser hem + black leather loafers on the RIGHT side of frame. The stone floor is the reference plane.\n- UPPER TWO-THIRDS: the hands exchange at chest level in the center, on a soft-focus background of the blurred plaza and glass facade.\nDo NOT show the hands floating in a void — the floor and shoes must be visible in the lower third of the frame.\n[ACTION] AirPods pass palm-to-palm between the two hands. Silent, unspoken exchange.\n[COMPOSITION] 85mm. Vertical 9:16 frame. Hands meeting at chest level in the center (upper 2/3). Floor + shoes in lower 1/3. Slight dolly-in feel. Shallow DoF on plaza background.\n[LIGHTING] Overcast wrap light. Consistent top-down.\n[MOOD] Silent craft transaction. Both Vindof pieces framed as visual equals. The handoff IS the reaction beat — no separate realization shot.\n[CONSTRAINTS] Character A's cream+graffiti sleeve enters from SCREEN-LEFT. Character B's red+dots sleeve enters from SCREEN-RIGHT. Lower third of frame MUST include the plaza floor, lower legs, and both characters' shoes. Do NOT show floating hands in a blank void. No faces. No text in image.`,
		referenceImageIds: [CHAR_A_SHEET_ID, CHAR_B_SHEET_ID, S05_IMAGE_ID],
		filename: "v4-scene-12-handoff.png",
		dependsOn: "05",
	},
	{
		id: "13",
		name: "Walk Away DIVERGENT",
		systemInstruction: `Wide 35mm locked-off. Matches Scene 02 framing exactly. Both Indian Gen Z males walking AWAY FROM EACH OTHER IN OPPOSITE DIRECTIONS. Character A in the RIGHT third of frame walking toward the RIGHT edge (3/4 rear). Character B in the LEFT third of frame walking toward the LEFT edge (3/4 rear). Plaza negative space dominates center. CRITICAL: they move APART, NOT together. Do NOT render both walking to the same side. Overcast wrap. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown hair with curtain bangs, soft jawline, light stubble. Oversized Vindof THE LAZY BUNCH cream camp-collar short-sleeve shirt (graffiti print visible on the back less, but the cream body + collar visible). Grey heather wide-leg baggy trousers. Clean white low-top sneakers.\n\nCharacter B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves, sharper jawline, clean-shaven. Vindof red and white dot-pattern knit polo (dot grid pattern wraps to the back — deep sangria red dots on off-white ground continuing on back panel). Black wide-leg baggy trousers. Black leather loafers.\n\n[ACTION — DIVERGENT MOTION — CRITICAL] The two characters walk in OPPOSITE DIRECTIONS — they are moving APART. Character A moves toward the RIGHT edge of the frame. Character B moves toward the LEFT edge of the frame. They walk AWAY FROM EACH OTHER. Do NOT show both characters moving toward the same side of the frame. Do NOT show them walking together. This is the walk-away bookend — each continues the path he started in Scene 02.\n\n[COMPOSITION] Wide 35mm locked-off frame. Matches Scene 02 framing EXACTLY (same camera position, same focal length, same eye-level). Character A occupies the RIGHT THIRD of frame, back to camera, 3/4 rear angle, right flank toward camera, stepping toward the right edge. Character B occupies the LEFT THIRD of frame, back to camera, 3/4 rear angle, left flank toward camera, stepping toward the left edge. Wide plaza negative space dominates the CENTER of frame between them. MIRROR-SYMMETRIC composition but DIVERGENT MOTION.\n[LIGHTING] Overcast diffused daylight. Soft wrap. Consistent with Scene 01/02.\n[MOOD] Quiet close. Each character continues the path he started — story ends as quietly as it began.\n[CONSTRAINTS — READ CAREFULLY]\n1. Character A is in the RIGHT third of frame walking RIGHT (away from center, toward the right edge).\n2. Character B is in the LEFT third of frame walking LEFT (away from center, toward the left edge).\n3. They move in OPPOSITE directions — apart, not together.\n4. Do NOT render both characters walking toward the same side.\n5. Do NOT render them side-by-side walking together.\n6. Plaza negative space dominates the center third of the frame.\n7. 3/4 rear angles — back of heads visible, faces not shown.\n8. No text in image.`,
		referenceImageIds: [CHAR_A_SHEET_ID, CHAR_B_SHEET_ID, S02_IMAGE_ID],
		filename: "v4-scene-13-walk-away.png",
		dependsOn: "02",
	},
];

function findImageIdByGeneration(genId: string): string {
	const row = db
		.prepare("SELECT id FROM images WHERE filename LIKE ?")
		.get(`${genId}%`) as { id: string } | null;
	if (!row) throw new Error(`No image found for generation ${genId}`);
	return row.id;
}

function copyToAssets(genId: string, filename: string): string {
	const srcPng = `./uploads/${genId}.png`;
	const srcJpg = `./uploads/${genId}.jpg`;
	const src = existsSync(srcPng) ? srcPng : srcJpg;
	const dest = `${ASSETS_DIR}/${filename}`;
	copyFileSync(src, dest);
	return dest;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

interface LogSceneEntry {
	id: string;
	name: string;
	filename: string;
	model: string;
	imageId?: string;
	generationId?: string;
	tokens?: number;
	error?: string;
	referenceImageIds: string[];
}

interface LogShape {
	version: string;
	model: string;
	aspectRatio: string;
	imageSize: string;
	charASheetId: string;
	charBSheetId: string;
	totalScenes: number;
	successCount: number;
	failCount: number;
	totalTokens: number;
	scenes: LogSceneEntry[];
}

function loadLog(): LogShape {
	const raw = readFileSync(LOG_PATH, "utf-8");
	return JSON.parse(raw) as LogShape;
}

function saveLog(log: LogShape): void {
	log.totalTokens = log.scenes.reduce((s, o) => s + (o.tokens ?? 0), 0);
	log.successCount = log.scenes.filter((o) => !o.error).length;
	log.failCount = log.scenes.length - log.successCount;
	writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

async function runSceneWithRetry(
	scene: SceneSpec,
): Promise<{ genId: string; imageId: string; tokens: number }> {
	const MAX_ATTEMPTS = 3;
	const BACKOFF_MS = 15_000;
	let lastErr: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const gen = await generate({
				prompt: scene.prompt,
				systemInstruction: scene.systemInstruction,
				referenceImageIds: scene.referenceImageIds,
				aspectRatio: "9:16",
				imageSize: "2K",
				forceImage: true,
				model: MODEL,
				sceneId: `scene-${scene.id}-v4-resume`,
			});
			const imageId = findImageIdByGeneration(gen.id);
			return {
				genId: gen.id,
				imageId,
				tokens: gen.tokenUsage.totalTokens,
			};
		} catch (err) {
			lastErr = err;
			const msg = (err as Error).message ?? String(err);
			console.warn(
				`  ⚠ Attempt ${attempt}/${MAX_ATTEMPTS} failed for scene ${scene.id}: ${msg}`,
			);
			if (attempt < MAX_ATTEMPTS) {
				console.warn(`  waiting ${BACKOFF_MS / 1000}s before retry...`);
				await sleep(BACKOFF_MS);
			}
		}
	}
	throw lastErr;
}

console.log("═══ Vindof Mirror Walk v4 — RESUME (scenes 11, 12, 13) ═══");
console.log(`Model: ${MODEL}`);
console.log(`Log: ${LOG_PATH}`);
console.log(`Env anchors — S02=${S02_IMAGE_ID}, S05=${S05_IMAGE_ID}, S10=${S10_IMAGE_ID}`);

const log = loadLog();
console.log(
	`\nLog (pre): success=${log.successCount}/${log.totalScenes}, fail=${log.failCount}, tokens=${log.totalTokens}`,
);

let stoppedEarly = false;
const resumeOutcomes: Array<{ id: string; status: "OK" | "FAIL"; imageId?: string; error?: string }> = [];

for (const scene of SCENES) {
	console.log(`\n── Scene ${scene.id} — ${scene.name} ──`);
	console.log(
		`  refs (${scene.referenceImageIds.length}): [${scene.referenceImageIds.join(", ")}]`,
	);

	try {
		const result = await runSceneWithRetry(scene);
		copyToAssets(result.genId, scene.filename);

		// UPDATE the entry in log.scenes in place — do not append.
		const idx = log.scenes.findIndex((s) => s.id === scene.id);
		if (idx === -1) {
			throw new Error(
				`Scene ${scene.id} not found in generation-log-v4.json scenes[]`,
			);
		}
		log.scenes[idx] = {
			id: scene.id,
			name: scene.name,
			filename: scene.filename,
			model: MODEL,
			imageId: result.imageId,
			generationId: result.genId,
			tokens: result.tokens,
			referenceImageIds: scene.referenceImageIds,
		};
		saveLog(log);

		resumeOutcomes.push({ id: scene.id, status: "OK", imageId: result.imageId });
		console.log(
			`  ✓ Scene ${scene.id} done — genId=${result.genId}, imageId=${result.imageId}, tokens=${result.tokens}`,
		);
	} catch (err) {
		const msg = (err as Error).message ?? String(err);
		console.error(`  ✗ Scene ${scene.id} FAILED after retries: ${msg}`);
		resumeOutcomes.push({ id: scene.id, status: "FAIL", error: msg });

		// If it's still a 401, STOP — don't hammer.
		if (/401/.test(msg) || /unauthorized/i.test(msg)) {
			console.error(
				"\n⛔ Still getting WisGate 401 after 3 attempts. Stopping — human decision required.",
			);
			stoppedEarly = true;
			break;
		}
		// For any other terminal error, move on to the next scene (don't block
		// unrelated scenes) but record it.
	}
}

const postLog = loadLog();

console.log("\n═══════════════════════════════════════════════");
console.log("  VINDOF MIRROR WALK v4 — RESUME COMPLETE");
console.log("═══════════════════════════════════════════════\n");
console.log(
	`Log (post): success=${postLog.successCount}/${postLog.totalScenes}, fail=${postLog.failCount}, tokens=${postLog.totalTokens}`,
);
console.log(`Stopped early: ${stoppedEarly}`);
console.log("\nResume outcomes:");
for (const r of resumeOutcomes) {
	if (r.status === "OK") {
		console.log(`  ✓ Scene ${r.id} — imageId=${r.imageId}`);
	} else {
		console.log(`  ✗ Scene ${r.id} — ${r.error}`);
	}
}
console.log(`\nAssets dir: ${ASSETS_DIR}/`);
