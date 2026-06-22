import { describe, expect, it } from "bun:test";
import { capFor } from "../src/lib/ref-cap";

describe("capFor — per-(provider, model, modality) reference cap [ADR-0017]", () => {
	it("Higgsfield default route → { total: 8 }", () => {
		expect(capFor("higgsfield", "higgsfield-nano-banana-pro", "image")).toEqual(
			{ total: 8 },
		);
	});

	it("Higgsfield gpt-image-2 CLI variant stays on the Higgsfield route → 8", () => {
		// Mirrors generate.ts: isHiggsfield is checked before isOpenAI, so a
		// `higgsfield-`-prefixed model rides the CLI cap, not the OpenAI cap.
		expect(capFor("higgsfield", "higgsfield-gpt-image-2", "image")).toEqual({
			total: 8,
		});
	});

	it("WisGate / gemini NanoBanana route → { total: 14, byCategory: {objects:6, humans:5} }", () => {
		expect(capFor("wisgate", "gemini-2.5-flash-image", "image")).toEqual({
			total: 14,
			byCategory: { objects: 6, humans: 5 },
		});
	});

	it("carries the WisGate typed sub-cap shape (objects/humans)", () => {
		const cap = capFor("wisgate", "gemini-3-pro-image-preview", "image");
		expect(cap.byCategory).toEqual({ objects: 6, humans: 5 });
	});

	it("nano_banana / nano-banana identifiers resolve to the WisGate route", () => {
		expect(capFor("wisgate", "nano_banana", "image")).toEqual({
			total: 14,
			byCategory: { objects: 6, humans: 5 },
		});
		expect(capFor("wisgate", "nano-banana-2", "image")).toEqual({
			total: 14,
			byCategory: { objects: 6, humans: 5 },
		});
	});

	it("gpt-image-2 (OpenAI) → { total: 3 }", () => {
		expect(capFor("openai", "gpt-image-2", "image")).toEqual({ total: 3 });
	});

	it("gpt_image_2 underscore spelling → { total: 3 }", () => {
		expect(capFor("openai", "gpt_image_2", "image")).toEqual({ total: 3 });
	});

	it("unknown model → documented safe default { total: 8 }", () => {
		expect(capFor("", "some-future-unknown-model", "image")).toEqual({
			total: 8,
		});
	});

	it("falls back to the provider hint when the model string is unrecognized", () => {
		expect(capFor("openai", "mystery", "image")).toEqual({ total: 3 });
		expect(capFor("wisgate", "mystery", "image")).toEqual({
			total: 14,
			byCategory: { objects: 6, humans: 5 },
		});
		expect(capFor("higgsfield", "mystery", "image")).toEqual({ total: 8 });
	});

	it("typed sub-caps are NOT enforced — total is the only trigger key in v1", () => {
		// ponytail: descriptor carries byCategory but the resolver ignores it.
		// total === objects + humans is incidental, not load-bearing.
		const cap = capFor("wisgate", "gemini-2.5-flash-image", "image");
		expect(cap.total).toBe(14);
	});
});
