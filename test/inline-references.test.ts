import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { WisGateRequest, WisGateResponse } from "../src/types";

const calls: WisGateRequest[] = [];
let dbGetImageCallCount = 0;

beforeAll(() => {
	mock.module("../src/wisgate", () => ({
		generateImage: async (req: WisGateRequest): Promise<WisGateResponse> => {
			calls.push(req);
			return {
				imageBuffer: Buffer.from("fakepng"),
				mimeType: "image/png",
				tokenUsage: { promptTokens: 1, candidateTokens: 1, totalTokens: 2 },
				finishReason: "STOP",
			};
		},
		checkBalance: async () => ({
			available_balance: 0,
			package_balance: 0,
			cash_balance: 0,
			token_balance: 0,
			is_token_unlimited_quota: true,
		}),
	}));

	mock.module("../src/db", () => ({
		getImage: (_id: string) => {
			dbGetImageCallCount++;
			return null;
		},
		insertGeneration: () => {},
		insertImage: () => {},
		insertTokenRecord: () => {},
		getTotalTokensSpent: () => 0,
		getBudgetConfig: () => null,
		getGeneration: () => null,
		getAllGenerations: () => [],
		getTokenHistory: () => [],
		updateBudgetCeiling: () => {},
		db: {},
	}));
});

describe("inline referenceImages", () => {
	it("forwards inline base64 refs to the model adapter without any DB lookup", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;
		dbGetImageCallCount = 0;

		const base64 = Buffer.from("hello-world-image").toString("base64");
		const result = await executeGeneration({
			prompt: "test",
			referenceImages: [{ data: base64, mimeType: "image/png" }],
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]!.referenceImages).toEqual([
			{ data: base64, mimeType: "image/png" },
		]);
		expect(dbGetImageCallCount).toBe(0);
		expect(result.id).toBeDefined();
	});

	it("rejects inline refs larger than the 10 MB cap", async () => {
		const { executeGeneration, ReferenceImageTooLargeError } = await import(
			"../src/routes/generate"
		);
		calls.length = 0;

		const oversized = "x".repeat(14_000_001);
		await expect(
			executeGeneration({
				prompt: "test",
				referenceImages: [{ data: oversized, mimeType: "image/png" }],
			}),
		).rejects.toBeInstanceOf(ReferenceImageTooLargeError);
		expect(calls).toHaveLength(0);
	});

	it("combines inline refs with referenceImageIds (inline first)", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;
		dbGetImageCallCount = 0;

		const base64 = Buffer.from("inline").toString("base64");
		await executeGeneration({
			prompt: "test",
			referenceImages: [{ data: base64, mimeType: "image/jpeg" }],
		}).catch(() => {});

		expect(calls[0]!.referenceImages?.[0]).toEqual({
			data: base64,
			mimeType: "image/jpeg",
		});
	});
});
