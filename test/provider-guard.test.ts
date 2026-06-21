// Provider-scoped budget guard [ADR-0007, slice #38].
//
// Drives a provider's cumulative spend past its budgetFor line and asserts the
// NEXT gen on that provider is blocked (ProviderBudgetExceededError → 402) and a
// budget-trip is fire-and-forget POSTed to the Console, while a DIFFERENT
// provider still under its line keeps serving (per-provider isolation, ADR-0007).
//
// db + the three provider modules are mocked so no real DB write / network gen
// happens; per-provider spend lives in an in-memory map we control directly.
import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// In-memory per-provider spend roll-up — stand-in for db.ts:provider_spend so we
// drive the line deterministically without touching the real imageengine.db.
const spend = new Map<string, number>();

// Only the wisgate path is ever dispatched here (the Higgsfield cases block
// BEFORE dispatch), so we mock only ../src/wisgate — mocking the other provider
// modules would leak into their own test files (bun mock.module is global).
const wisgateCalls: unknown[] = [];

const fakeResponse = {
	imageBuffer: Buffer.from("fakepng"),
	mimeType: "image/png" as const,
	tokenUsage: { promptTokens: 1, candidateTokens: 1, totalTokens: 2 },
	finishReason: "STOP",
};

beforeAll(() => {
	mock.module("../src/db", () => ({
		getImage: () => null,
		insertGeneration: () => {},
		insertImage: () => {},
		insertTokenRecord: () => {},
		// budget-guard middleware (imported via the generate route) needs these:
		getBudgetConfig: () => null,
		getTotalTokensSpent: () => 0,
		// the spend roll-up under test:
		getProviderSpend: (p: string) => spend.get(p) ?? 0,
		addProviderSpend: (p: string, usd: number) => {
			if (!Number.isFinite(usd) || usd <= 0) return;
			spend.set(p, (spend.get(p) ?? 0) + usd);
		},
	}));

	mock.module("../src/wisgate", () => ({
		generateImage: async (req: unknown) => {
			wisgateCalls.push(req);
			return fakeResponse;
		},
		checkBalance: async () => ({ available_balance: 0 }),
	}));
});

const HIGGS_MODEL = "higgsfield-nano-banana-pro"; // → provider "higgsfield", line $10
const WISGATE_MODEL = "gemini-2.5-flash-image"; // → provider "wisgate", line $25

const origFetch = global.fetch;
const origUrl = process.env.CONSOLE_INGEST_URL;
const origPort = process.env.ORCH_PORT;

beforeEach(() => {
	spend.clear();
	wisgateCalls.length = 0;
});

afterEach(() => {
	global.fetch = origFetch;
	if (origUrl === undefined) delete process.env.CONSOLE_INGEST_URL;
	else process.env.CONSOLE_INGEST_URL = origUrl;
	if (origPort === undefined) delete process.env.ORCH_PORT;
	else process.env.ORCH_PORT = origPort;
});

describe("provider-scoped budget guard — block + trip POST [ADR-0007, #38]", () => {
	test("spend past the line → next gen on that provider is blocked + trips the Console", async () => {
		process.env.CONSOLE_INGEST_URL = "http://127.0.0.1:4100/api/ingest";
		delete process.env.ORCH_PORT;
		const trips: { url: string; body: Record<string, unknown> }[] = [];
		global.fetch = mock((url: string, init: RequestInit) => {
			trips.push({ url, body: JSON.parse(init.body as string) });
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as unknown as typeof fetch;

		const { executeGeneration, ProviderBudgetExceededError } = await import(
			"../src/routes/generate"
		);

		// Drive Higgsfield ($10 line) over its line.
		spend.set("higgsfield", 12);

		let caught: unknown;
		try {
			await executeGeneration({ prompt: "blocked", model: HIGGS_MODEL });
		} catch (err) {
			caught = err;
		}

		// The throw originates at the top of executeGeneration, BEFORE any provider
		// dispatch — so the real Higgsfield CLI is never reached (no mock needed).
		expect(caught).toBeInstanceOf(ProviderBudgetExceededError);

		// A budget-trip was fire-and-forget POSTed to <base>/api/budget-trip (the
		// /api/ingest suffix stripped), with the PINNED shape.
		expect(trips).toHaveLength(1);
		expect(trips[0].url).toBe("http://127.0.0.1:4100/api/budget-trip");
		expect(trips[0].body).toMatchObject({
			provider: "higgsfield",
			model: HIGGS_MODEL,
			spentUsd: 12,
			limitUsd: 10,
		});
		expect(typeof trips[0].body.at).toBe("number");
	});

	test("per-provider ISOLATION: a different provider under its line still serves", async () => {
		delete process.env.CONSOLE_INGEST_URL;
		delete process.env.ORCH_PORT; // no Console → trip POST is a clean no-op
		global.fetch = mock(() =>
			Promise.resolve(new Response(null, { status: 200 })),
		) as unknown as typeof fetch;

		const { executeGeneration } = await import("../src/routes/generate");

		// Higgsfield is over its line, but WisGate ($25) is untouched.
		spend.set("higgsfield", 50);

		const result = await executeGeneration({
			prompt: "served",
			model: WISGATE_MODEL,
		});

		// WisGate served normally — isolation holds.
		expect(wisgateCalls).toHaveLength(1);
		expect(result.model).toBe(WISGATE_MODEL);
		// And its spend accrued (served-gen increment fired).
		expect(spend.get("wisgate") ?? 0).toBeGreaterThan(0);
		// Higgsfield, meanwhile, would still be blocked.
		expect(spend.get("higgsfield")).toBe(50);
	});

	test("served gen increments the serving provider's spend (feeds the next block)", async () => {
		delete process.env.CONSOLE_INGEST_URL;
		delete process.env.ORCH_PORT;
		global.fetch = mock(() =>
			Promise.resolve(new Response(null, { status: 200 })),
		) as unknown as typeof fetch;

		const { executeGeneration } = await import("../src/routes/generate");

		expect(spend.get("wisgate") ?? 0).toBe(0);
		await executeGeneration({ prompt: "one", model: WISGATE_MODEL });
		const afterOne = spend.get("wisgate") ?? 0;
		expect(afterOne).toBeGreaterThan(0);
		await executeGeneration({ prompt: "two", model: WISGATE_MODEL });
		expect(spend.get("wisgate") ?? 0).toBeCloseTo(afterOne * 2, 6);
	});

	test("trip POST never throws even when the Console fetch rejects (never fails a gen)", async () => {
		process.env.CONSOLE_INGEST_URL = "http://127.0.0.1:4100/api/ingest";
		delete process.env.ORCH_PORT;
		global.fetch = mock(() =>
			Promise.reject(new Error("console down")),
		) as unknown as typeof fetch;

		const { executeGeneration, ProviderBudgetExceededError } = await import(
			"../src/routes/generate"
		);

		spend.set("higgsfield", 99);

		// The block still surfaces as the budget error — the failed trip POST is
		// swallowed and does not change the outcome.
		await expect(
			executeGeneration({ prompt: "blocked", model: HIGGS_MODEL }),
		).rejects.toBeInstanceOf(ProviderBudgetExceededError);
	});
});
