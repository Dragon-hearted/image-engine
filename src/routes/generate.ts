import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import {
	getImage,
	insertGeneration,
	insertImage,
	insertTokenRecord,
} from "../db";
import { generateHiggsfieldImage } from "../higgsfield-provider";
import { executeBatch } from "../lib/batch-executor";
import { montage, MontageInputError } from "../lib/montage";
import { capFor } from "../lib/ref-cap";
import { budgetGuard } from "../middleware/budget-guard";
import { rateLimiter } from "../middleware/rate-limiter";
import { generateOpenAIImage } from "../openai-provider";
import type {
	BatchRequest,
	BatchResult,
	GenerationRequest,
	GenerationResult,
	OpenAIImageModel,
	TokenUsage,
	WisGateModel,
} from "../types";
import { generateImage } from "../wisgate";

/**
 * Higgsfield (NanoBanana Pro) is the default generation provider for
 * ImageEngine: any caller that omits `model` gets it. gemini/openai models stay
 * selectable via `model`.
 */
const DEFAULT_MODEL = "higgsfield-nano-banana-pro";

/**
 * Permission gate for the Higgsfield → gemini auto-fallback. By default a
 * Higgsfield failure surfaces a clear, actionable error — NO silent provider
 * swap. Opt in per-request via `request.autoFallback: true`, or globally via
 * `IMAGE_ENGINE_AUTO_FALLBACK=1`.
 */
function autoFallbackAllowed(request: GenerationRequest): boolean {
	if (typeof request.autoFallback === "boolean") return request.autoFallback;
	return process.env.IMAGE_ENGINE_AUTO_FALLBACK === "1";
}

function openaiSizeFromAspectRatio(
	ar?: string,
): "1024x1024" | "1024x1536" | "1536x1024" {
	if (!ar) return "1024x1024";
	if (ar === "9:16" || ar === "4:5" || ar === "2:3") return "1024x1536";
	if (ar === "16:9" || ar === "3:2" || ar === "21:9") return "1536x1024";
	return "1024x1024";
}

/** Map a reference image's mime type to a file extension for temp spill files. */
function extFromMimeType(mimeType: string): string {
	if (mimeType === "image/jpeg") return "jpg";
	if (mimeType === "image/webp") return "webp";
	return "png";
}

/** Vault file extensions [ADR-0012] treated as image reference slots. */
const VAULT_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

/** Map a vault image file extension to its mime type. */
function mimeFromExt(ext: string): string {
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	if (ext === "webp") return "image/webp";
	return "image/png";
}

/**
 * Collapse an overflow reference tail into a single deterministic montage so the
 * resolved group never exceeds the backend's cap [ADR-0017]. For N refs / cap C:
 *   N <= C → unchanged (montage is the exception, not the norm)
 *   N >  C → [...first C-1 pinned, montage(rest)]  (length exactly C)
 * Returns the resolved base64 list plus the montage entry (or null when no
 * collapse happened) so the caller can keep the Higgsfield path list aligned.
 */
export async function resolveReferenceGroup(
	refs: { data: string; mimeType: string }[],
	cap: number,
): Promise<{
	refs: { data: string; mimeType: string }[];
	composite: { data: string; mimeType: "image/png" } | null;
}> {
	if (refs.length <= cap) return { refs, composite: null };
	const composite = await montage(refs.slice(cap - 1));
	return { refs: [...refs.slice(0, cap - 1), composite], composite };
}

const UPLOADS_DIR = "./uploads";

export class ReferenceImageTooLargeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReferenceImageTooLargeError";
	}
}

export const generate = new Hono();

// Apply rate limiter and budget guard to all generation routes
generate.use("*", rateLimiter());
generate.use("*", budgetGuard());

/**
 * Shared generation logic used by both the single endpoint and batch executor.
 * Resolves reference images, calls WisGate, saves to disk, records in DB.
 */
export async function executeGeneration(
	request: GenerationRequest,
): Promise<GenerationResult> {
	const model = request.model ?? DEFAULT_MODEL;
	const isHiggsfield = model.startsWith("higgsfield");
	const isOpenAI = model.startsWith("gpt-");

	// Resolve reference images ONCE into two parallel representations:
	//  - referenceImages: base64 list for the gemini/WisGate path (and the
	//    Higgsfield → gemini fallback)
	//  - referencePaths: local file paths for the Higgsfield CLI's repeated
	//    `--image` flags (inline base64 refs are spilled to temp files)
	// Inline (base64) refs first, then DB-looked-up IDs.
	let referenceImages: { data: string; mimeType: string }[] = [];
	let referencePaths: string[] = [];
	const tempRefPaths: string[] = [];
	if (request.referenceImages?.length) {
		for (const ref of request.referenceImages) {
			// 10 MB binary ≈ 13.5 MB base64 string; cap conservatively
			if (!ref.data || ref.data.length > 14_000_000) {
				throw new ReferenceImageTooLargeError(
					"Reference image exceeds 10 MB cap",
				);
			}
			referenceImages.push({ data: ref.data, mimeType: ref.mimeType });
			if (isHiggsfield) {
				const tmpExt = extFromMimeType(ref.mimeType);
				const tmpPath = join(tmpdir(), `ie-ref-${randomUUID()}.${tmpExt}`);
				await writeFile(tmpPath, Buffer.from(ref.data, "base64"));
				referencePaths.push(tmpPath);
				tempRefPaths.push(tmpPath);
			}
		}
	}
	if (request.referenceImageIds?.length) {
		for (const refId of request.referenceImageIds) {
			const img = getImage(refId);
			if (!img) {
				throw new Error(`Reference image not found: ${refId}`);
			}
			const file = Bun.file(img.path);
			const buffer = await file.arrayBuffer();
			referenceImages.push({
				data: Buffer.from(buffer).toString("base64"),
				mimeType: img.mimeType,
			});
			referencePaths.push(img.path);
		}
	}

	// Reference data (vault) [ADR-0012]: read curated on-disk files directly.
	// ponytail: plain node:fs reads — NO Obsidian API / vault import. Image files
	// join the reference group (and the cap/montage flow below); text files
	// (markdown / JSON / txt) are appended to the prompt as reference context.
	if (request.referenceData?.length) {
		for (const refPath of request.referenceData) {
			const ext = refPath.split(".").pop()?.toLowerCase() ?? "";
			let buffer: Buffer;
			try {
				buffer = await readFile(refPath);
			} catch {
				throw new Error(`Reference data file not found: ${refPath}`);
			}
			if (VAULT_IMAGE_EXTS.has(ext)) {
				referenceImages.push({
					data: buffer.toString("base64"),
					mimeType: mimeFromExt(ext),
				});
				// The vault path is already a real on-disk file — feed the
				// Higgsfield CLI directly, no temp spill needed.
				if (isHiggsfield) referencePaths.push(refPath);
			} else {
				request.prompt = `${request.prompt}\n\n[Reference data: ${refPath}]\n${buffer.toString("utf8")}`;
			}
		}
	}

	// Overflow resolution [ADR-0017]: collapse refs past the model's cap into one
	// deterministic montage so exactly `cap` inputs reach the provider.
	// ponytail: triggers on `total` only — category-blind per ADR-0017 v1.
	const providerHint = isHiggsfield
		? "higgsfield"
		: isOpenAI
			? "openai"
			: "wisgate";
	const cap = capFor(providerHint, model, "image").total;
	const resolved = await resolveReferenceGroup(referenceImages, cap);
	referenceImages = resolved.refs;
	if (resolved.composite && isHiggsfield) {
		// Keep the Higgsfield path list aligned with the base64 list: spill the
		// montage to a temp file and collapse referencePaths the same way (first
		// cap-1 pinned + montage last). Overflow temp files beyond cap-1 stay in
		// tempRefPaths and are still cleaned up in the finally below.
		const ext = extFromMimeType(resolved.composite.mimeType);
		const tmpPath = join(tmpdir(), `ie-montage-${randomUUID()}.${ext}`);
		await writeFile(tmpPath, Buffer.from(resolved.composite.data, "base64"));
		tempRefPaths.push(tmpPath);
		referencePaths = [...referencePaths.slice(0, cap - 1), tmpPath];
	}

	let response: {
		imageBuffer: Buffer;
		mimeType: string;
		tokenUsage: TokenUsage;
		finishReason: string;
	};
	// Records the provider actually served, which may differ from the requested
	// `model` if a Higgsfield failure falls back to gemini — so the gallery /
	// token ledger reflect the truth.
	let servedModel = model;

	try {
		if (isHiggsfield) {
			try {
				response = await generateHiggsfieldImage({
					prompt: request.prompt,
					model,
					aspectRatio: request.aspectRatio,
					quality: request.openaiQuality,
					referenceImagePaths:
						referencePaths.length > 0 ? referencePaths : undefined,
				});
				servedModel = model;
			} catch (err) {
				// Permission-gated fallback: by default we DO NOT silently swap
				// providers — we surface a clear, actionable error. The caller can
				// opt into an automatic gemini fallback per-request
				// (`autoFallback: true`) or globally (`IMAGE_ENGINE_AUTO_FALLBACK=1`),
				// or just re-issue the request with an explicit `model`.
				if (!autoFallbackAllowed(request)) {
					const detail = err instanceof Error ? err.message : String(err);
					throw new Error(
						`Higgsfield (${model}) generation failed and auto-fallback is disabled. ` +
							"Fix the Higgsfield CLI (e.g. `higgsfield auth login`), retry with an explicit " +
							"`model` (e.g. gemini-2.5-flash-image), or permit a one-off fallback with " +
							"`autoFallback: true` / IMAGE_ENGINE_AUTO_FALLBACK=1. " +
							`Underlying error: ${detail}`,
					);
				}
				console.warn(
					"[image-engine] Higgsfield failed; auto-fallback permitted, " +
						"falling back to gemini-2.5-flash-image:",
					err,
				);
				response = await generateImage({
					model: "gemini-2.5-flash-image",
					prompt: request.prompt,
					systemInstruction: request.systemInstruction,
					referenceImages:
						referenceImages.length > 0 ? referenceImages : undefined,
					aspectRatio: request.aspectRatio,
					imageSize: request.imageSize,
					forceImage: request.forceImage,
					conversationHistory: request.conversationHistory,
				});
				servedModel = "gemini-2.5-flash-image";
			}
		} else if (isOpenAI) {
			// OpenAI Images API takes pixel dimensions, not aspect-ratio strings,
			// and has no equivalent for systemInstruction/referenceImages/forceImage.
			// Those WisGate-specific fields are intentionally ignored here.
			const size = openaiSizeFromAspectRatio(request.aspectRatio);
			const quality = request.openaiQuality ?? "high";
			response = await generateOpenAIImage({
				model: model as OpenAIImageModel,
				prompt: request.prompt,
				size,
				quality,
			});
		} else {
			response = await generateImage({
				model: model as WisGateModel,
				prompt: request.prompt,
				systemInstruction: request.systemInstruction,
				referenceImages:
					referenceImages.length > 0 ? referenceImages : undefined,
				aspectRatio: request.aspectRatio,
				imageSize: request.imageSize,
				forceImage: request.forceImage,
				conversationHistory: request.conversationHistory,
			});
		}
	} finally {
		// Best-effort cleanup of any temp reference files we spilled for the CLI.
		await Promise.all(
			tempRefPaths.map((p) => unlink(p).catch(() => undefined)),
		);
	}

	// Save the generated image to disk
	const genId = randomUUID();
	const ext = response.mimeType === "image/jpeg" ? "jpg" : "png";
	const filename = `${genId}.${ext}`;
	await Bun.write(`${UPLOADS_DIR}/${filename}`, response.imageBuffer);

	const now = new Date().toISOString();

	// Record the image
	insertImage({
		id: randomUUID(),
		filename,
		originalName: filename,
		path: `${UPLOADS_DIR}/${filename}`,
		mimeType: response.mimeType,
		size: response.imageBuffer.length,
		createdAt: now,
	});

	// Record the generation
	insertGeneration({
		id: genId,
		prompt: request.prompt,
		model: servedModel,
		systemInstruction: request.systemInstruction ?? null,
		aspectRatio: request.aspectRatio ?? null,
		imageSize: request.imageSize ?? null,
		resultPath: `${UPLOADS_DIR}/${filename}`,
		referenceImageIds: JSON.stringify(request.referenceImageIds ?? []),
		finishReason: response.finishReason,
		createdAt: now,
	});

	// Record token usage
	insertTokenRecord({
		id: randomUUID(),
		generationId: genId,
		model: servedModel,
		promptTokens: response.tokenUsage.promptTokens,
		candidateTokens: response.tokenUsage.candidateTokens,
		totalTokens: response.tokenUsage.totalTokens,
		createdAt: now,
	});

	return {
		id: genId,
		imageUrl: `/api/gallery/${genId}/image`,
		model: servedModel,
		prompt: request.prompt,
		tokenUsage: response.tokenUsage,
		sceneId: request.sceneId,
		createdAt: now,
	};
}

// POST /api/generate — single image generation
generate.post("/", async (c) => {
	const body = await c.req.json<GenerationRequest>();

	if (!body.prompt) {
		return c.json({ error: "prompt is required" }, 400);
	}

	try {
		const result = await executeGeneration(body);
		return c.json(result, 201);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (err instanceof ReferenceImageTooLargeError) {
			return c.json({ error: message }, 413);
		}
		// Malformed montage input is a hard-block — same class as the too-large
		// guard above, surfaced as a readable 400.
		if (err instanceof MontageInputError) {
			return c.json({ error: message }, 400);
		}
		if (
			message.startsWith("Reference image not found") ||
			message.startsWith("Reference data file not found")
		) {
			return c.json({ error: message }, 404);
		}
		return c.json({ error: message }, 500);
	}
});

// POST /api/generate/batch — batch image generation
generate.post("/batch", async (c) => {
	const body = await c.req.json<BatchRequest>();

	if (!body.items?.length) {
		return c.json(
			{ error: "items array is required and must not be empty" },
			400,
		);
	}

	const batchResult: BatchResult = await executeBatch(body);
	return c.json(batchResult);
});
