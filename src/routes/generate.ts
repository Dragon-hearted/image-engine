import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
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
 * Higgsfield is the default generation provider for ImageEngine: any caller
 * that omits `model` gets it. gemini/openai models stay selectable via `model`.
 */
const DEFAULT_MODEL = "higgsfield-gpt-image-2";

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
	const referenceImages: { data: string; mimeType: string }[] = [];
	const referencePaths: string[] = [];
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
					aspectRatio: request.aspectRatio,
					quality: request.openaiQuality,
					referenceImagePaths:
						referencePaths.length > 0 ? referencePaths : undefined,
				});
				servedModel = model;
			} catch (err) {
				console.error(
					"[image-engine] Higgsfield failed, falling back to gemini-2.5-flash-image:",
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
		if (message.startsWith("Reference image not found")) {
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
