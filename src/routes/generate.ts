import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
	getImage,
	insertGeneration,
	insertImage,
	insertTokenRecord,
} from "../db";
import { executeBatch } from "../lib/batch-executor";
import { budgetGuard } from "../middleware/budget-guard";
import { rateLimiter } from "../middleware/rate-limiter";
import type {
	BatchRequest,
	BatchResult,
	GenerationRequest,
	GenerationResult,
	WisGateResponse,
} from "../types";
import { generateImage } from "../wisgate";

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
	const model = request.model ?? "gemini-2.5-flash-image";

	// Resolve reference images: inline (base64) first, then DB-looked-up IDs
	const referenceImages: { data: string; mimeType: string }[] = [];
	if (request.referenceImages?.length) {
		for (const ref of request.referenceImages) {
			// 10 MB binary ≈ 13.5 MB base64 string; cap conservatively
			if (!ref.data || ref.data.length > 14_000_000) {
				throw new ReferenceImageTooLargeError(
					"Reference image exceeds 10 MB cap",
				);
			}
			referenceImages.push({ data: ref.data, mimeType: ref.mimeType });
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
		}
	}

	const response: WisGateResponse = await generateImage({
		model,
		prompt: request.prompt,
		systemInstruction: request.systemInstruction,
		referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
		aspectRatio: request.aspectRatio,
		imageSize: request.imageSize,
		forceImage: request.forceImage,
		conversationHistory: request.conversationHistory,
	});

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
		model,
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
		model,
		promptTokens: response.tokenUsage.promptTokens,
		candidateTokens: response.tokenUsage.candidateTokens,
		totalTokens: response.tokenUsage.totalTokens,
		createdAt: now,
	});

	return {
		id: genId,
		imageUrl: `/api/gallery/${genId}/image`,
		model,
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
