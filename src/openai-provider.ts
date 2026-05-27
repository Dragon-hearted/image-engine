import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenAIImageModel, TokenUsage } from "./types";

// WisGate proxies the OpenAI image API at api.wisgate.ai using the same
// WISDOM_GATE_KEY as the Gemini endpoint. We hit it through this compat layer
// so a single key drives both providers and we don't need a separate OpenAI
// account/billing. See https://wisdom-docs.juheapi.com/llms.txt
const API_URL = "https://api.wisgate.ai/v1/images/generations";
const MAX_RETRIES = 3;

// Mirror wisgate.ts: re-read .env on every call so a rotated key is picked
// up without restarting the subprocess. process.env is a frozen Bun snapshot
// from process start and goes stale the moment the user edits .env.
const DOTENV_KEY = "WISDOM_GATE_KEY";
const DOTENV_CANDIDATES = [
	join(import.meta.dir, "..", ".env"),
	join(process.cwd(), ".env"),
];

function readKeyFromDotenv(): string | null {
	for (const path of DOTENV_CANDIDATES) {
		let raw: string;
		try {
			raw = readFileSync(path, "utf8");
		} catch {
			continue;
		}
		const key = parseDotenvKey(raw, DOTENV_KEY);
		if (key) return key;
	}
	return null;
}

function parseDotenvKey(text: string, name: string): string | null {
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const k = line.slice(0, eq).replace(/^export\s+/, "").trim();
		if (k !== name) continue;
		let v = line.slice(eq + 1).trim();
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		) {
			v = v.slice(1, -1);
		}
		return v;
	}
	return null;
}

function getApiKey(): string {
	const key = readKeyFromDotenv();
	if (!key) {
		throw new Error("WISDOM_GATE_KEY missing in .env");
	}
	return key;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OpenAIRequest {
	model: OpenAIImageModel;
	prompt: string;
	size: "1024x1024" | "1024x1536" | "1536x1024";
	quality: "low" | "medium" | "high";
	n?: number;
}

export interface OpenAIResponse {
	imageBuffer: Buffer;
	mimeType: "image/png";
	tokenUsage: TokenUsage;
	finishReason: "stop" | "error";
}

export async function generateOpenAIImage(
	request: OpenAIRequest,
): Promise<OpenAIResponse> {
	const apiKey = getApiKey();

	const body = {
		model: request.model,
		prompt: request.prompt,
		size: request.size,
		quality: request.quality,
		n: request.n ?? 1,
		response_format: "b64_json",
	};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			await sleep(2 ** attempt * 1000);
		}

		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const status = response.status;
			const errorBody = await response.text();

			// No retry on 400 or 401
			if (status === 400) {
				throw new Error(`WisGate-OpenAI bad request (400): ${errorBody}`);
			}
			if (status === 401) {
				throw new Error("WisGate-OpenAI unauthorized (401): check WISDOM_GATE_KEY");
			}

			// Retry on 429 and 5xx
			if (status === 429 || status >= 500) {
				lastError = new Error(`OpenAI error (${status}): ${errorBody}`);
				if (attempt < MAX_RETRIES) continue;
				throw new Error(
					`OpenAI image generation failed after ${MAX_RETRIES} retries: ${status} ${errorBody}`,
				);
			}

			throw new Error(`OpenAI error (${status}): ${errorBody}`);
		}

		const data = (await response.json()) as {
			data?: { b64_json?: string }[];
			usage?: {
				input_tokens?: number;
				output_tokens?: number;
				total_tokens?: number;
			};
		};

		const b64 = data.data?.[0]?.b64_json;
		if (!b64) {
			throw new Error("OpenAI response contained no image data");
		}

		const imageBuffer = Buffer.from(b64, "base64");

		const usage = data.usage ?? {};
		const inputTokens = usage.input_tokens ?? 0;
		const outputTokens = usage.output_tokens ?? 0;
		const totalTokens =
			usage.total_tokens ?? inputTokens + outputTokens;

		// Map OpenAI's token usage onto the shared TokenUsage shape used by
		// the route handler and DB so insertTokenRecord works unchanged.
		// promptTokens ← input, candidateTokens ← output.
		const tokenUsage: TokenUsage = {
			promptTokens: inputTokens,
			candidateTokens: outputTokens,
			totalTokens,
		};

		return {
			imageBuffer,
			mimeType: "image/png",
			tokenUsage,
			finishReason: "stop",
		};
	}

	throw lastError ?? new Error("OpenAI request failed after retries");
}
