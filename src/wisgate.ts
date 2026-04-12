import type {
	WisGateBalanceResponse,
	WisGateRequest,
	WisGateResponse,
} from "./types";

const API_BASE = "https://api.wisgate.ai";
const MAX_RETRIES = 3;

function getApiKey(): string {
	const key = process.env.WISDOM_GATE_KEY;
	if (!key) throw new Error("WISDOM_GATE_KEY environment variable is not set");
	return key;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateImage(
	request: WisGateRequest,
): Promise<WisGateResponse> {
	const apiKey = getApiKey();

	// Build the user parts: text first, then reference images
	const userParts: Record<string, unknown>[] = [{ text: request.prompt }];

	if (request.referenceImages?.length) {
		for (const ref of request.referenceImages) {
			userParts.push({
				inline_data: { mime_type: ref.mimeType, data: ref.data },
			});
		}
	}

	// Build contents array
	let contents: Record<string, unknown>[];

	if (request.conversationHistory?.length) {
		// Use conversation history as base, converting camelCase inlineData to snake_case inline_data for the API
		contents = request.conversationHistory.map((entry) => ({
			role: entry.role,
			parts: entry.parts.map((part) => {
				if (part.inlineData) {
					return {
						inline_data: {
							mime_type: part.inlineData.mimeType,
							data: part.inlineData.data,
						},
					};
				}
				return { text: part.text };
			}),
		}));
		// Append the new user message
		contents.push({ role: "user", parts: userParts });
	} else {
		contents = [{ role: "user", parts: userParts }];
	}

	// Build generation config
	const generationConfig: Record<string, unknown> = {
		responseModalities: request.forceImage ? ["IMAGE"] : ["TEXT", "IMAGE"],
	};

	const imageConfig: Record<string, string> = {};
	if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
	if (request.imageSize) imageConfig.imageSize = request.imageSize;
	if (Object.keys(imageConfig).length > 0) {
		generationConfig.imageConfig = imageConfig;
	}

	// Build request body
	const body: Record<string, unknown> = { contents, generationConfig };

	if (request.systemInstruction) {
		body.systemInstruction = {
			parts: [{ text: request.systemInstruction }],
		};
	}

	const url = `${API_BASE}/v1beta/models/${request.model}:generateContent`;

	// Retry loop with exponential backoff
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			await sleep(2 ** attempt * 1000);
		}

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": apiKey,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const status = response.status;
			const errorBody = await response.text();

			// No retry on 400 or 401
			if (status === 400) {
				throw new Error(`WisGate bad request (400): ${errorBody}`);
			}
			if (status === 401) {
				throw new Error("WisGate unauthorized (401): check WISDOM_GATE_KEY");
			}

			// Retry on 429 and 5xx
			if (status === 429 || status >= 500) {
				lastError = new Error(`WisGate error (${status}): ${errorBody}`);
				if (attempt < MAX_RETRIES) continue;
				throw new Error(
					`WisGate error (${status}) after ${MAX_RETRIES} retries: ${errorBody}`,
				);
			}

			throw new Error(`WisGate error (${status}): ${errorBody}`);
		}

		const data = await response.json();
		const candidate = data.candidates?.[0];

		if (!candidate) {
			throw new Error("WisGate returned no candidates");
		}

		// Check for safety finish reason
		if (candidate.finishReason === "SAFETY") {
			throw new Error(
				"WisGate generation blocked by safety filters. Try rephrasing your prompt to avoid potentially harmful or restricted content.",
			);
		}

		// Extract image and text from response parts (response uses camelCase)
		let imageBuffer: Buffer | null = null;
		let mimeType = "image/png";
		let textResponse: string | undefined;

		for (const part of candidate.content.parts) {
			if (part.inlineData) {
				imageBuffer = Buffer.from(part.inlineData.data, "base64");
				mimeType = part.inlineData.mimeType;
			} else if (part.text) {
				textResponse = part.text;
			}
		}

		if (!imageBuffer) {
			throw new Error(
				`WisGate response contained no image data. Text response: ${textResponse ?? "(none)"}`,
			);
		}

		// Extract token usage
		const usage = data.usageMetadata ?? {};
		const tokenUsage = {
			promptTokens: usage.promptTokenCount ?? 0,
			candidateTokens: usage.candidatesTokenCount ?? 0,
			totalTokens: usage.totalTokenCount ?? 0,
		};

		return {
			imageBuffer,
			mimeType,
			textResponse,
			tokenUsage,
			finishReason: candidate.finishReason ?? "UNKNOWN",
		};
	}

	throw lastError ?? new Error("WisGate request failed after retries");
}

export async function checkBalance(): Promise<WisGateBalanceResponse> {
	const apiKey = getApiKey();

	const response = await fetch(`${API_BASE}/v1/users/me/balance`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(
			`WisGate balance check failed (${response.status}): ${errorBody}`,
		);
	}

	return (await response.json()) as WisGateBalanceResponse;
}
