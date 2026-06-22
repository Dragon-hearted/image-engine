import { describe, expect, it } from "bun:test";
import { addProviderSpend, getProviderSpend } from "../src/db";
import { budgetFor, providerOf } from "../src/lib/budget";

describe("budgetFor — per-(provider, model, modality) USD line [ADR-0007, #38]", () => {
	it("Higgsfield default route → tightest line (pricey CLI credits)", () => {
		expect(
			budgetFor("higgsfield", "higgsfield-nano-banana-pro", "image"),
		).toEqual({ limitUsd: 10 });
	});

	it("Higgsfield gpt-image-2 CLI variant stays on the Higgsfield line (checked before OpenAI)", () => {
		expect(budgetFor("higgsfield", "higgsfield-gpt-image-2", "image")).toEqual({
			limitUsd: 10,
		});
	});

	it("OpenAI gpt-image route → its own line", () => {
		expect(budgetFor("openai", "gpt-image-2", "image")).toEqual({
			limitUsd: 20,
		});
		expect(budgetFor("openai", "gpt_image_2", "image")).toEqual({
			limitUsd: 20,
		});
	});

	it("WisGate / gemini / nano-banana route → its own line", () => {
		expect(budgetFor("wisgate", "gemini-2.5-flash-image", "image")).toEqual({
			limitUsd: 25,
		});
		expect(budgetFor("wisgate", "nano_banana", "image")).toEqual({
			limitUsd: 25,
		});
	});

	it("falls back to the provider hint when the model string is unrecognized", () => {
		expect(budgetFor("openai", "mystery", "image")).toEqual({ limitUsd: 20 });
		expect(budgetFor("higgsfield", "mystery", "image")).toEqual({
			limitUsd: 10,
		});
	});

	it("unknown provider AND unknown model → documented fallback line", () => {
		expect(budgetFor("", "some-future-model", "image")).toEqual({
			limitUsd: 10,
		});
	});

	it("env override raises a provider line", () => {
		const prev = process.env.IMAGE_ENGINE_BUDGET_HIGGSFIELD_USD;
		process.env.IMAGE_ENGINE_BUDGET_HIGGSFIELD_USD = "99";
		try {
			expect(
				budgetFor("higgsfield", "higgsfield-nano-banana-pro", "image").limitUsd,
			).toBe(99);
		} finally {
			if (prev === undefined)
				delete process.env.IMAGE_ENGINE_BUDGET_HIGGSFIELD_USD;
			else process.env.IMAGE_ENGINE_BUDGET_HIGGSFIELD_USD = prev;
		}
	});
});

describe("providerOf — canonical provider routing [#38]", () => {
	it("routes by model string first, provider hint as fallback", () => {
		expect(providerOf("higgsfield-nano-banana-pro")).toBe("higgsfield");
		expect(providerOf("gpt-image-2")).toBe("openai");
		expect(providerOf("gemini-2.5-flash-image")).toBe("wisgate");
		expect(providerOf("mystery", "wisgate")).toBe("wisgate");
		expect(providerOf("mystery", "")).toBe("unknown");
	});
});

describe("getProviderSpend / addProviderSpend — per-provider roll-up [#38]", () => {
	// Synthetic, test-scoped provider keys so the shared imageengine.db isn't
	// polluted with fake spend on the real provider rows, and assertions are
	// delta-based (robust to pre-existing state and re-runs).
	const A = "test-prov-alpha";
	const B = "test-prov-beta";

	it("spend accrues cumulatively per provider", () => {
		const base = getProviderSpend(A);
		addProviderSpend(A, 3.5);
		addProviderSpend(A, 1.25);
		expect(getProviderSpend(A)).toBeCloseTo(base + 4.75, 6);
	});

	it("spend is ISOLATED per provider (one provider's spend doesn't show under another)", () => {
		const baseB = getProviderSpend(B);
		addProviderSpend(A, 10); // pile onto A
		expect(getProviderSpend(B)).toBeCloseTo(baseB, 6); // B unchanged
	});

	it("unknown / never-served provider → 0", () => {
		expect(getProviderSpend("provider-that-never-served-xyz")).toBe(0);
	});

	it("zero / negative / non-finite increments are no-ops", () => {
		const base = getProviderSpend(A);
		addProviderSpend(A, 0);
		addProviderSpend(A, -5);
		addProviderSpend(A, Number.NaN);
		expect(getProviderSpend(A)).toBeCloseTo(base, 6);
	});

	it("the guard's real key path: providerOf(model) → spend isolates Higgsfield from WisGate", () => {
		// Mirrors how builder-ie-guard will key spend: canonical provider from the
		// model string. Use synthetic per-test model suffixes to avoid colliding
		// with real provider rows.
		const hig = providerOf("higgsfield-nano-banana-pro"); // "higgsfield"
		const wis = providerOf("gemini-2.5-flash-image"); // "wisgate"
		const baseWis = getProviderSpend(`${wis}-isolation-test`);
		addProviderSpend(`${hig}-isolation-test`, 7);
		expect(getProviderSpend(`${wis}-isolation-test`)).toBeCloseTo(baseWis, 6);
	});
});
