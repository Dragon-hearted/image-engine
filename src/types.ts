// ─── WisGate API Types ───

export type WisGateModel =
	| "gemini-3-pro-image-preview"
	| "gemini-3.1-flash-image-preview"
	| "gemini-2.5-flash-image";

export type AspectRatio =
	| "1:1"
	| "2:3"
	| "3:2"
	| "3:4"
	| "4:3"
	| "4:5"
	| "5:4"
	| "9:16"
	| "16:9"
	| "21:9"
	| "1:4"
	| "1:8"
	| "4:1"
	| "8:1";

export type ImageSize = "0.5K" | "1K" | "2K" | "4K";

export interface GeminiPart {
	text?: string;
	inlineData?: {
		mimeType: string;
		data: string; // base64
	};
}

export interface GeminiContent {
	role: "user" | "model";
	parts: GeminiPart[];
}

export interface WisGateRequest {
	model: WisGateModel;
	prompt: string;
	systemInstruction?: string;
	referenceImages?: { data: string; mimeType: string }[];
	aspectRatio?: AspectRatio;
	imageSize?: ImageSize;
	forceImage?: boolean;
	conversationHistory?: GeminiContent[];
}

export interface TokenUsage {
	promptTokens: number;
	candidateTokens: number;
	totalTokens: number;
}

export interface WisGateResponse {
	imageBuffer: Buffer;
	mimeType: string;
	textResponse?: string;
	tokenUsage: TokenUsage;
	finishReason: string;
}

export interface WisGateBalanceResponse {
	available_balance: number;
	package_balance: number;
	cash_balance: number;
	token_balance: number;
	is_token_unlimited_quota: boolean;
}

// ─── ImageEngine API Types ───

export interface GenerationRequest {
	prompt: string;
	model?: WisGateModel;
	referenceImageIds?: string[];
	referenceImages?: { data: string; mimeType: string }[];
	aspectRatio?: AspectRatio;
	imageSize?: ImageSize;
	forceImage?: boolean;
	systemInstruction?: string;
	conversationHistory?: GeminiContent[];
	sceneId?: string;
}

export interface GenerationResult {
	id: string;
	imageUrl: string;
	model: string;
	prompt: string;
	tokenUsage: TokenUsage;
	sceneId?: string;
	createdAt: string;
}

export interface BatchRequest {
	items: GenerationRequest[];
	dependencies?: { sceneId: string; dependsOn: string[] }[];
}

export interface BatchResult {
	results: Record<string, GenerationResult | { error: string }>;
	totalTokens: number;
}

// ─── Database Record Types ───

export interface GenerationRecord {
	id: string;
	prompt: string;
	model: string;
	systemInstruction: string | null;
	aspectRatio: string | null;
	imageSize: string | null;
	resultPath: string;
	referenceImageIds: string;
	finishReason: string;
	createdAt: string;
}

export interface ImageRecord {
	id: string;
	filename: string;
	originalName: string;
	path: string;
	mimeType: string;
	size: number;
	createdAt: string;
}

export interface TokenCostRecord {
	id: string;
	generationId: string;
	model: string;
	promptTokens: number;
	candidateTokens: number;
	totalTokens: number;
	createdAt: string;
}

export interface BudgetConfig {
	id: string;
	tokenCeiling: number;
	warnAtPercent: number;
	isActive: number;
	updatedAt: string;
}

export interface BudgetStatus {
	tokenCeiling: number;
	tokensSpent: number;
	tokensRemaining: number;
	percentUsed: number;
	isActive: boolean;
	wisGateBalance?: WisGateBalanceResponse;
}
