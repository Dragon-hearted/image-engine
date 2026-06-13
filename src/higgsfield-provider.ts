/**
 * Higgsfield CLI provider — ImageEngine's DEFAULT image transport.
 *
 * Shells out to the globally-installed `higgsfield` binary (v0.1.40+) to
 * generate images. The default CLI model is NanoBanana Pro (job_set_type
 * `nano_banana_2`); `gpt_image_2` and any other CLI model stay selectable via
 * the request `model` or the `HIGGSFIELD_MODEL` env. It blocks with
 * `--wait --json`, parses the result media URL out of the final job object
 * array, downloads the image bytes, and returns them as a Buffer in the
 * standard ImageEngine provider shape
 * `{ imageBuffer, mimeType, tokenUsage, finishReason }`.
 *
 * Ported from SceneBoard's `higgsfield-client.ts` (which wrote to disk); here
 * the public entry point returns a Buffer so `executeGeneration` can persist it
 * to ./uploads + SQLite exactly like every other provider.
 *
 * No new npm runtime deps — the binary is an ENVIRONMENT prerequisite
 * (`npm install -g @higgsfield/cli`, then `higgsfield auth login` once).
 *
 * `executeGeneration` treats any thrown error here as a signal that the served
 * provider failed; whether it then falls back to gemini-2.5-flash-image is
 * permission-gated (env/flag), never a silent swap.
 */

import type { AspectRatio, TokenUsage } from "./types";

// ─── Public types ───

export type HiggsfieldAspectRatio =
	| "1:1"
	| "4:3"
	| "3:4"
	| "16:9"
	| "9:16"
	| "3:2"
	| "2:3";

export type HiggsfieldQuality = "low" | "medium" | "high";

export type HiggsfieldResolution = "1k" | "2k" | "4k";

export interface HiggsfieldGenerateRequest {
	/** Full prompt body. The CLI models have no separate system slot. */
	prompt: string;
	/**
	 * CLI model (`job_set_type`) to generate with, e.g. `nano_banana_2`
	 * (NanoBanana Pro — the default) or `gpt_image_2`. When omitted, resolves
	 * from the `HIGGSFIELD_MODEL` env, then the built-in default.
	 */
	model?: string;
	/** ImageEngine aspect ratio. Mapped to the Higgsfield enum; defaults to 16:9. */
	aspectRatio?: AspectRatio;
	/** Output resolution. Defaults to 2k. */
	resolution?: HiggsfieldResolution;
	/** Quality knob. Defaults to high. */
	quality?: HiggsfieldQuality;
	/**
	 * Local reference image file paths. Each becomes a repeated `--image` flag
	 * (role `image`). Local paths auto-upload. Up to ~8.
	 */
	referenceImagePaths?: string[];
	/** Wait timeout passed to `--wait-timeout` (default 10m). */
	waitTimeout?: string;
	/** Poll interval passed to `--wait-interval` (default 3s). */
	waitInterval?: string;
}

export interface HiggsfieldProviderResponse {
	imageBuffer: Buffer;
	mimeType: string;
	tokenUsage: TokenUsage;
	finishReason: string;
}

// ─── Typed errors (let the caller decide on fallback) ───

/** Base class so callers can `instanceof HiggsfieldError` for fallback. */
export class HiggsfieldError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HiggsfieldError";
	}
}

/** Not authenticated / session expired — run `higgsfield auth login`. */
export class HiggsfieldAuthError extends HiggsfieldError {
	constructor(message: string) {
		super(message);
		this.name = "HiggsfieldAuthError";
	}
}

/** `--wait-timeout` exceeded before the job reached a terminal state. */
export class HiggsfieldTimeoutError extends HiggsfieldError {
	constructor(message: string) {
		super(message);
		this.name = "HiggsfieldTimeoutError";
	}
}

/** Non-zero exit, unparseable stdout, missing binary, or no URL in result. */
export class HiggsfieldCliError extends HiggsfieldError {
	constructor(message: string) {
		super(message);
		this.name = "HiggsfieldCliError";
	}
}

// ─── Internals ───

/**
 * Resolve the higgsfield binary at CALL time (not module-load time) so a
 * rotated `HIGGSFIELD_BIN` is picked up without a restart — and so the unit
 * tests can point it at a fake binary deterministically regardless of module
 * import order. Default: `higgsfield` on PATH.
 */
function resolveBinary(): string {
	return process.env.HIGGSFIELD_BIN || "higgsfield";
}

/**
 * Default Higgsfield CLI model (`job_set_type`). NanoBanana Pro is exposed by
 * the CLI as `nano_banana_2` (confirmed via `higgsfield model list`:
 * `nano_banana_2 → "Nano Banana Pro"`). This is the operator-preferred default;
 * the brand's logo variants were generated "NanoBanana Pro via Higgsfield".
 */
export const DEFAULT_HIGGSFIELD_MODEL = "nano_banana_2";

/**
 * Map ImageEngine's public Higgsfield model ids to CLI `job_set_type` tokens.
 * Unknown / bare `higgsfield` ids fall through to the env/default resolution.
 */
const PUBLIC_TO_CLI_MODEL: Record<string, string> = {
	"higgsfield-nano-banana-pro": "nano_banana_2",
	"higgsfield-gpt-image-2": "gpt_image_2",
};

/**
 * Resolve the CLI model id at CALL time (not module-load) so a rotated
 * `HIGGSFIELD_MODEL` is picked up without a restart. Precedence:
 *   1. explicit public model id (mapped to its CLI token)
 *   2. `HIGGSFIELD_MODEL` env (raw CLI token)
 *   3. the built-in NanoBanana Pro default
 */
export function resolveHiggsfieldModel(publicModel?: string): string {
	if (publicModel && PUBLIC_TO_CLI_MODEL[publicModel]) {
		return PUBLIC_TO_CLI_MODEL[publicModel];
	}
	return process.env.HIGGSFIELD_MODEL || DEFAULT_HIGGSFIELD_MODEL;
}

const AUTH_HINTS = [
	"session expired",
	"not authenticated",
	"please log in",
	"please login",
	"auth login",
	"unauthorized",
	"unauthenticated",
];

const TIMEOUT_HINTS = [
	"timed out",
	"timeout",
	"deadline exceeded",
	"wait timeout",
];

const NOT_FOUND_HINTS = ["command not found", "no such file", "enoent"];

const IMAGE_URL_RE = /\.(png|jpg|jpeg|webp|gif|avif)(\?|#|$)/i;

/** Higgsfield-supported aspect ratios. */
const HIGGSFIELD_ASPECTS = new Set<HiggsfieldAspectRatio>([
	"1:1",
	"4:3",
	"3:4",
	"16:9",
	"9:16",
	"3:2",
	"2:3",
]);

/**
 * Map an ImageEngine aspect ratio to the narrower Higgsfield enum. Ratios the
 * CLI doesn't support (4:5, 5:4, 21:9, 1:4, 1:8, 4:1, 8:1) collapse to 16:9.
 */
export function toHiggsfieldAspect(ar?: AspectRatio): HiggsfieldAspectRatio {
	if (ar && HIGGSFIELD_ASPECTS.has(ar as HiggsfieldAspectRatio)) {
		return ar as HiggsfieldAspectRatio;
	}
	return "16:9";
}

/** Infer the response mime type from a media URL's file extension. */
export function mimeTypeFromUrl(url: string): string {
	const lower = url.toLowerCase();
	if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
	if (lower.includes(".webp")) return "image/webp";
	return "image/png";
}

/**
 * JSON key segments that denote INPUT / reference media in a job object (never
 * the generated result). The Higgsfield job JSON nests attached `--image`
 * references under `params.medias[].data.url`; URLs anywhere under these keys
 * are inputs and must never be picked as the result.
 */
const INPUT_CONTAINER_KEYS = new Set([
	"params",
	"input",
	"inputs",
	"reference",
	"references",
	"ref",
	"refs",
	"source",
	"sources",
	"request",
]);

interface SpawnOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Run a higgsfield subcommand, capturing stdout/stderr. Uses Bun.spawn when
 * available, falling back to node:child_process so the module is testable and
 * portable. Never throws on non-zero exit — returns the outcome for the
 * caller to classify into a typed error.
 */
async function runHiggsfield(args: string[]): Promise<SpawnOutcome> {
	const binary = resolveBinary();
	// Prefer Bun's native spawn when running under Bun.
	const bun = (globalThis as { Bun?: typeof import("bun") }).Bun;
	if (bun?.spawn) {
		try {
			const proc = bun.spawn([binary, ...args], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			const exitCode = await proc.exited;
			return { exitCode, stdout, stderr };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (NOT_FOUND_HINTS.some((h) => message.toLowerCase().includes(h))) {
				throw new HiggsfieldCliError(
					`Higgsfield binary "${binary}" not found: ${message}`,
				);
			}
			throw new HiggsfieldCliError(`Failed to spawn higgsfield: ${message}`);
		}
	}

	// Node fallback (also used in unit tests that mock child_process).
	const { spawn } = await import("node:child_process");
	return new Promise<SpawnOutcome>((resolve, reject) => {
		const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		child.on("error", (err: Error) => {
			if (NOT_FOUND_HINTS.some((h) => err.message.toLowerCase().includes(h))) {
				reject(
					new HiggsfieldCliError(
						`Higgsfield binary "${binary}" not found: ${err.message}`,
					),
				);
				return;
			}
			reject(
				new HiggsfieldCliError(`Failed to spawn higgsfield: ${err.message}`),
			);
		});
		child.on("close", (code: number | null) => {
			resolve({ exitCode: code ?? 0, stdout, stderr });
		});
	});
}

/** Classify a failed CLI outcome into the most specific typed error. */
function classifyFailure(
	outcome: SpawnOutcome,
	context: string,
): HiggsfieldError {
	const haystack = `${outcome.stdout}\n${outcome.stderr}`.toLowerCase();
	if (AUTH_HINTS.some((h) => haystack.includes(h))) {
		return new HiggsfieldAuthError(
			`Higgsfield not authenticated (${context}). Run \`higgsfield auth login\`. ${outcome.stderr.trim()}`,
		);
	}
	if (TIMEOUT_HINTS.some((h) => haystack.includes(h))) {
		return new HiggsfieldTimeoutError(
			`Higgsfield generation timed out (${context}). ${outcome.stderr.trim()}`,
		);
	}
	return new HiggsfieldCliError(
		`Higgsfield CLI failed (${context}, exit ${outcome.exitCode}): ${outcome.stderr.trim() || outcome.stdout.trim()}`,
	);
}

/**
 * Recursively walk a parsed JSON value and return the GENERATED output image
 * URL — not an attached input reference.
 *
 * The `--wait --json` job object contains BOTH the uploaded INPUT reference
 * URLs (nested under `params.medias[].data.url`) and the generated OUTPUT
 * (`result_url`). A naive "last URL wins" walk returns the input reference
 * whenever a `--image` ref is attached, which silently downloads the input
 * image verbatim. We instead rank candidates by a path-aware preference:
 *   1. not under an input container AND under an output-named key
 *      (result / output / generated)
 *   2. not under an input container AND has an image extension
 *   3. not under an input container (any http url)
 *   4. has an image extension (legacy fallback)
 *   5. any http url (legacy fallback)
 * Within a tier the LAST match wins (job arrays list the freshest result last).
 * Defensive tiers keep this working across CLI minor-version key shifts.
 */
export function extractImageUrl(parsed: unknown): string | undefined {
	const found: { url: string; path: string[] }[] = [];

	const visit = (value: unknown, path: string[]): void => {
		if (typeof value === "string") {
			if (/^https?:\/\//i.test(value)) found.push({ url: value, path });
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((item, i) => visit(item, [...path, String(i)]));
			return;
		}
		if (value && typeof value === "object") {
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				visit(v, [...path, k]);
			}
		}
	};
	visit(parsed, []);
	if (found.length === 0) return undefined;

	const isInput = (f: { path: string[] }): boolean =>
		f.path.some((seg) => INPUT_CONTAINER_KEYS.has(seg.toLowerCase()));
	const isOutputNamed = (f: { path: string[] }): boolean =>
		f.path.some((seg) => /result|output|generated/i.test(seg));
	const hasExt = (u: string): boolean => IMAGE_URL_RE.test(u);

	const tiers: ((f: { url: string; path: string[] }) => boolean)[] = [
		(f) => !isInput(f) && isOutputNamed(f),
		(f) => !isInput(f) && hasExt(f.url),
		(f) => !isInput(f),
		(f) => hasExt(f.url),
		() => true,
	];
	for (const pred of tiers) {
		const matches = found.filter(pred);
		if (matches.length > 0) return matches[matches.length - 1].url;
	}
	return found[found.length - 1].url;
}

/** Build the argv for a `generate create <model> … --wait --json` call. */
export function buildGenerateArgs(req: HiggsfieldGenerateRequest): string[] {
	const args = [
		"generate",
		"create",
		resolveHiggsfieldModel(req.model),
		"--prompt",
		req.prompt,
		"--aspect_ratio",
		toHiggsfieldAspect(req.aspectRatio),
		"--quality",
		req.quality ?? "high",
		"--resolution",
		req.resolution ?? "2k",
	];
	for (const ref of req.referenceImagePaths ?? []) {
		args.push("--image", ref);
	}
	if (req.waitTimeout) args.push("--wait-timeout", req.waitTimeout);
	if (req.waitInterval) args.push("--wait-interval", req.waitInterval);
	args.push("--wait", "--json");
	return args;
}

/** Default ceiling for the media download (ms). Overridable per call. */
const DOWNLOAD_TIMEOUT_MS =
	Number(process.env.HIGGSFIELD_DOWNLOAD_TIMEOUT_MS) || 30_000;

/**
 * Download a remote URL and return the bytes as a Buffer.
 *
 * The request (and its body read) is bounded by an AbortController so a stalled
 * connection cannot hang the generation pipeline indefinitely — on timeout we
 * surface a `HiggsfieldTimeoutError` so the caller can fall back.
 */
export async function downloadToBuffer(
	url: string,
	timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<Buffer> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) {
			throw new HiggsfieldCliError(
				`Failed to download generated image (${res.status} ${res.statusText}) from ${url}`,
			);
		}
		return Buffer.from(await res.arrayBuffer());
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new HiggsfieldTimeoutError(
				`Timed out after ${timeoutMs}ms downloading generated image from ${url}.`,
			);
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Generate one image via the Higgsfield CLI and return its bytes as a Buffer in
 * the standard ImageEngine provider shape. Throws a typed HiggsfieldError on
 * any failure so `executeGeneration` can fall back to gemini.
 *
 * Higgsfield reports no token accounting, so `tokenUsage` is recorded as zeros
 * and `finishReason` is always `"stop"`.
 */
export async function generateHiggsfieldImage(
	req: HiggsfieldGenerateRequest,
): Promise<HiggsfieldProviderResponse> {
	const model = resolveHiggsfieldModel(req.model);
	const args = buildGenerateArgs(req);
	const outcome = await runHiggsfield(args);

	if (outcome.exitCode !== 0) {
		throw classifyFailure(outcome, `generate create ${model}`);
	}

	// Auth/timeout hints can appear even on exit 0 in some CLI versions, so we
	// classify them explicitly before attempting to parse the JSON payload.
	const haystack = `${outcome.stdout}\n${outcome.stderr}`.toLowerCase();
	if (AUTH_HINTS.some((h) => haystack.includes(h))) {
		throw new HiggsfieldAuthError(
			`Higgsfield reported an auth problem. Run \`higgsfield auth login\`. ${outcome.stderr.trim()}`,
		);
	}
	if (TIMEOUT_HINTS.some((h) => haystack.includes(h))) {
		throw new HiggsfieldTimeoutError(
			`Higgsfield generation timed out (generate create ${model}). ${outcome.stderr.trim()}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(outcome.stdout.trim());
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new HiggsfieldCliError(
			`Could not parse higgsfield --json output: ${message}. Raw: ${outcome.stdout.slice(0, 500)}`,
		);
	}

	const imageUrl = extractImageUrl(parsed);
	if (!imageUrl) {
		throw new HiggsfieldCliError(
			`No result media URL found in higgsfield output. Raw: ${outcome.stdout.slice(0, 500)}`,
		);
	}

	const imageBuffer = await downloadToBuffer(imageUrl);
	return {
		imageBuffer,
		mimeType: mimeTypeFromUrl(imageUrl),
		tokenUsage: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
		finishReason: "stop",
	};
}
