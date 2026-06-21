import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, mock } from "bun:test";
import sharp from "sharp";
import { montage } from "../src/lib/montage";
import type { WisGateRequest, WisGateResponse } from "../src/types";

const calls: WisGateRequest[] = [];

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
		getImage: () => null,
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

/** Build a solid-color PNG fixture inline (no external assets). */
async function solidPng(
	r: number,
	g: number,
	b: number,
): Promise<{ data: string; mimeType: string }> {
	const buf = await sharp({
		create: { width: 32, height: 32, channels: 3, background: { r, g, b } },
	})
		.png()
		.toBuffer();
	return { data: buf.toString("base64"), mimeType: "image/png" };
}

/** Spill bytes to a temp vault file with the given extension; returns its path. */
async function tmpVaultFile(ext: string, bytes: Buffer): Promise<string> {
	const path = join(tmpdir(), `ie-vault-${randomUUID()}.${ext}`);
	await writeFile(path, bytes);
	return path;
}

describe("resolveReferenceGroup — overflow montage [ADR-0017]", () => {
	it("collapses the overflow tail: N > C → exactly C entries, last is the montage", async () => {
		const { resolveReferenceGroup } = await import("../src/routes/generate");
		const refs = await Promise.all([
			solidPng(255, 0, 0),
			solidPng(0, 255, 0),
			solidPng(0, 0, 255),
			solidPng(255, 255, 0),
			solidPng(0, 255, 255),
		]);

		const { refs: out, composite } = await resolveReferenceGroup(refs, 3);

		expect(out).toHaveLength(3);
		// First cap-1 pinned in their own slots, untouched.
		expect(out.slice(0, 2)).toEqual(refs.slice(0, 2));
		// Last slot is the deterministic montage of the overflow tail.
		const expected = await montage(refs.slice(2));
		expect(composite).not.toBeNull();
		expect(out[2]).toEqual(expected);
		expect(out[2]!.mimeType).toBe("image/png");
	});

	it("passes through unchanged when N <= C (montage is the exception)", async () => {
		const { resolveReferenceGroup } = await import("../src/routes/generate");
		const refs = await Promise.all([solidPng(1, 2, 3), solidPng(4, 5, 6)]);

		const { refs: out, composite } = await resolveReferenceGroup(refs, 3);

		expect(out).toEqual(refs);
		expect(composite).toBeNull();
	});

	it("is deterministic: same group twice → byte-identical montage", async () => {
		const { resolveReferenceGroup } = await import("../src/routes/generate");
		const refs = await Promise.all([
			solidPng(10, 20, 30),
			solidPng(40, 50, 60),
			solidPng(70, 80, 90),
			solidPng(100, 110, 120),
		]);

		const a = await resolveReferenceGroup(refs, 2);
		const b = await resolveReferenceGroup(refs, 2);

		expect(a.composite!.data).toBe(b.composite!.data);
	});
});

describe("executeGeneration — reference group reaches the provider", () => {
	it("assembles > cap refs → exactly `cap` inputs reach the provider, last is the montage", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;

		// gemini route → cap 14. Feed 16 inline refs so 3 overflow into one slot.
		const refs = await Promise.all(
			Array.from({ length: 16 }, (_, i) => solidPng(i * 5, 0, 255 - i * 5)),
		);

		await executeGeneration({
			prompt: "test",
			model: "gemini-2.5-flash-image",
			referenceImages: refs,
		});

		expect(calls).toHaveLength(1);
		const received = calls[0]!.referenceImages!;
		expect(received).toHaveLength(14);
		expect(received.slice(0, 13)).toEqual(refs.slice(0, 13));
		const expected = await montage(refs.slice(13));
		expect(received[13]).toEqual(expected);
	});

	it("a vault IMAGE path joins the group as a reference", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;

		const vaultPng = await sharp({
			create: { width: 16, height: 16, channels: 3, background: { r: 7, g: 7, b: 7 } },
		})
			.png()
			.toBuffer();
		const vaultPath = await tmpVaultFile("png", vaultPng);
		const inline = await solidPng(9, 9, 9);

		await executeGeneration({
			prompt: "test",
			model: "gemini-2.5-flash-image",
			referenceImages: [inline],
			referenceData: [vaultPath],
		});

		const received = calls[0]!.referenceImages!;
		expect(received).toHaveLength(2);
		expect(received[0]).toEqual(inline);
		expect(received[1]).toEqual({
			data: vaultPng.toString("base64"),
			mimeType: "image/png",
		});
	});

	it("a vault MARKDOWN path augments the prompt with reference context", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;

		const note = "SECRET-VAULT-NOTE: the hero wears a red scarf.";
		const vaultPath = await tmpVaultFile("md", Buffer.from(note, "utf8"));

		await executeGeneration({
			prompt: "draw the hero",
			model: "gemini-2.5-flash-image",
			referenceData: [vaultPath],
		});

		expect(calls[0]!.prompt).toContain("draw the hero");
		expect(calls[0]!.prompt).toContain(note);
		// No image refs were added for a text-only vault file.
		expect(calls[0]!.referenceImages).toBeUndefined();
	});

	it("a missing vault file is a clear hard error", async () => {
		const { executeGeneration } = await import("../src/routes/generate");
		calls.length = 0;

		let caught: unknown;
		await executeGeneration({
			prompt: "test",
			model: "gemini-2.5-flash-image",
			referenceData: [join(tmpdir(), `does-not-exist-${randomUUID()}.png`)],
		}).catch((e) => {
			caught = e;
		});

		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toMatch(/Reference data file not found/);
		expect(calls).toHaveLength(0);
	});
});
