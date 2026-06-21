import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import {
	addProviderSpend,
	getImage,
	getProviderSpend,
	insertGeneration,
	insertImage,
	insertTokenRecord,
} from "../db";
import { generateHiggsfieldImage } from "../higgsfield-provider";
import { executeBatch } from "../lib/batch-executor";
import { budgetFor, providerOf } from "../lib/budget";
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

/**
 * Thrown by the provider-scoped budget guard [ADR-0007, slice #38] when the
 * SERVING provider's cumulative spend has already crossed its `budgetFor` line.
 * Surfaced as a 402 by the route handler (distinct from the WisGate-wallet 402
 * in budget-guard.ts — this is the ADDITIVE per-provider spend-line).
 */
export class ProviderBudgetExceededError extends Error {
	constructor(
		public readonly provider: string,
		public readonly model: string,
		public readonly spentUsd: number,
		public readonly limitUsd: number,
	) {
		super(
			`Provider budget-line exceeded for ${provider} (${model}): ` +
				`$${spentUsd.toFixed(2)} spent ≥ $${limitUsd.toFixed(2)} line — generation blocked [ADR-0007]. ` +
				`Raise IMAGE_ENGINE_BUDGET_${provider.toUpperCase()}_USD or route to a different provider.`,
		);
		this.name = "ProviderBudgetExceededError";
	}
}

/**
 * Per-served-generation USD cost estimate, by provider [slice #38].
 *
 * image-engine has NO real per-gen USD figure: WisGate/OpenAI report tokens (not
 * dollars) and the Higgsfield CLI reports nothing at all (CLI credits, not a
 * token API) — a token-sum would under-count exactly the pricey route the guard
 * most needs to gate. So the per-provider spend roll-up is fed a configured flat
 * per-gen estimate, env-overridable (`IMAGE_ENGINE_<PROVIDER>_COST_USD`, e.g.
 * `IMAGE_ENGINE_HIGGSFIELD_COST_USD`).
 *
 * // ponytail: a flat estimate, NOT a pricing engine — just enough to accrue
 * cumulative spend so the line trips; precise token→USD pricing is deferred.
 */
const DEFAULT_GEN_COST_USD: Record<string, number> = {
	higgsfield: 1, // pricey CLI credits — the route the guard most needs to gate
	openai: 0.5,
	wisgate: 0.25,
};
const FALLBACK_GEN_COST_USD = 0.25;

function costFor(provider: string): number {
	const envKey = `IMAGE_ENGINE_${provider.toUpperCase()}_COST_USD`;
	const fromEnv = Number.parseFloat(process.env[envKey] ?? "");
	if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
	return DEFAULT_GEN_COST_USD[provider] ?? FALLBACK_GEN_COST_USD;
}

const TRIP_POST_TIMEOUT_MS = 2000;

/**
 * Resolve the Console budget-trip endpoint — SAME env as the Emitter
 * (`CONSOLE_INGEST_URL` base / `ORCH_PORT`), but POSTs to `<base>/api/budget-trip`
 * (the `/api/ingest` suffix is stripped). No Console configured → null (no-op).
 */
function resolveBudgetTripUrl(): string | null {
	const explicit = process.env.CONSOLE_INGEST_URL;
	if (explicit) {
		const base = explicit.replace(/\/+$/, "").replace(/\/api\/ingest$/, "");
		return `${base}/api/budget-trip`;
	}
	const port = process.env.ORCH_PORT;
	if (port) return `http://127.0.0.1:${port}/api/budget-trip`;
	return null;
}

/**
 * Fire-and-forget POST of a budget-trip to the Console [slice #38]. Mirrors the
 * Emitter's `post()`: short timeout, swallows ALL errors, no-ops when no Console
 * is configured.
 *
 * // ponytail: MUST NEVER block or fail a generation — the 402 block is the
 * guard; this trip is only the Console's visible signal. Separate POST, NOT a
 * Run/Step envelope, so the Emitter pair is untouched.
 */
export function postBudgetTrip(trip: {
	provider: string;
	model: string;
	spentUsd: number;
	limitUsd: number;
	at: number;
}): Promise<void> {
	const url = resolveBudgetTripUrl();
	if (!url) return Promise.resolve();
	return fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(trip),
		signal: AbortSignal.timeout(TRIP_POST_TIMEOUT_MS),
	})
		.then(() => undefined)
		.catch(() => undefined);
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

	// ── Provider-scoped budget guard [ADR-0007, slice #38] ──
	// Gated on the SERVING provider — never a global cross-provider gate. If this
	// provider's cumulative spend has already crossed its budgetFor line, BLOCK
	// the next gen (don't silently execute) and fire a trip to the Console.
	// ponytail: REACTIVE (cumulative spend ≥ line → block the NEXT gen on that
	// provider); projected pre-flight cost is a deferred refinement. The WisGate
	// wallet 402 (budget-guard middleware) stays; this is the ADDITIVE per-provider
	// spend-line for every provider incl. Higgsfield (which has no wallet API).
	const provider = providerOf(model);
	const { limitUsd } = budgetFor(provider, model, "image");
	const spentSoFar = getProviderSpend(provider);
	if (spentSoFar >= limitUsd) {
		// ponytail: fire-and-forget — the trip POST must NEVER block/fail a gen.
		void postBudgetTrip({
			provider,
			model,
			spentUsd: spentSoFar,
			limitUsd,
			at: Date.now(),
		});
		throw new ProviderBudgetExceededError(provider, model, spentSoFar, limitUsd);
	}

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

	// Record this served generation's spend against the SERVING provider — which
	// may differ from the requested model on a Higgsfield→gemini fallback, so we
	// key off servedModel (the truth) not the requested model. Lazy per-gen USD
	// estimate (see costFor); feeds the reactive budget-line above.
	const servedProvider = providerOf(servedModel);
	addProviderSpend(servedProvider, costFor(servedProvider));

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
		// Provider-scoped budget-line block [ADR-0007, #38] → 402 (additive to the
		// WisGate-wallet 402); echoes the trip shape the Console banner consumes.
		if (err instanceof ProviderBudgetExceededError) {
			return c.json(
				{
					error: message,
					provider: err.provider,
					model: err.model,
					spentUsd: err.spentUsd,
					limitUsd: err.limitUsd,
				},
				402,
			);
		}
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
