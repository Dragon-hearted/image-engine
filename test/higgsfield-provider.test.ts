/**
 * Unit tests for the Higgsfield CLI provider — fully HERMETIC (no real binary,
 * no network).
 *
 * Strategy (mirrors SceneBoard's higgsfield-client.test.ts):
 *  - `buildGenerateArgs` / `extractImageUrl` are pure → tested directly.
 *  - `generateHiggsfieldImage` spawns the CLI → we point `HIGGSFIELD_BIN` at a
 *    fake bash binary whose behaviour is driven by a `MODE:<x>` token embedded
 *    in the PROMPT (always passed as an argv element). For the success path we
 *    stub `globalThis.fetch` so the download step never touches the network.
 *
 * The env var pointing at the fake binary MUST be set before the module is
 * first evaluated (BINARY is a module-level const), so the module is loaded via
 * dynamic import after the assignment.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Fake CLI binary (behaviour chosen by a MODE:<x> token in the prompt) ─────

const FAKE_SCRIPT = [
	"#!/usr/bin/env bash",
	"mode=success",
	'for a in "$@"; do',
	'  case "$a" in',
	'    MODE:*) mode="${a#MODE:}" ;;',
	"  esac",
	"done",
	'case "$mode" in',
	'  cli) echo "Error: something broke internally" 1>&2; exit 1 ;;',
	'  input) echo "[{\\"id\\":\\"job1\\",\\"result_url\\":\\"https://out.cdn/hf_generated.png\\",\\"params\\":{\\"medias\\":[{\\"data\\":{\\"url\\":\\"https://in.cdn/uploaded-reference.png\\"}}]}}]" ;;',
	'  success) echo "[{\\"id\\":\\"job1\\",\\"results\\":[{\\"url\\":\\"https://example.com/sheet.png\\"}]}]" ;;',
	"esac",
	"",
].join("\n");

const FAKE_DIR = join(tmpdir(), "ie-higgsfield-provider-test");
mkdirSync(FAKE_DIR, { recursive: true });
const FAKE_BIN = join(FAKE_DIR, "fake-higgsfield.sh");
writeFileSync(FAKE_BIN, FAKE_SCRIPT, { mode: 0o755 });
process.env.HIGGSFIELD_BIN = FAKE_BIN;

const {
	buildGenerateArgs,
	extractImageUrl,
	generateHiggsfieldImage,
	resolveHiggsfieldModel,
	toHiggsfieldAspect,
	DEFAULT_HIGGSFIELD_MODEL,
	HiggsfieldError,
	HiggsfieldCliError,
} = await import("../src/higgsfield-provider");

// ─── pure helpers ─────────────────────────────────────────────────────────────

describe("buildGenerateArgs", () => {
	test("uses defaults (16:9 / 2k) and the NanoBanana Pro model — NO --quality", () => {
		const args = buildGenerateArgs({ prompt: "a sheet" });
		expect(args.slice(0, 3)).toEqual(["generate", "create", "nano_banana_2"]);
		expect(args[args.indexOf("--prompt") + 1]).toBe("a sheet");
		expect(args[args.indexOf("--aspect_ratio") + 1]).toBe("16:9");
		// `--quality` is a gpt_image_2-only flag; nano_banana_2 rejects it
		// ("Unknown params: quality"), so it must be absent for the default model.
		expect(args).not.toContain("--quality");
		// nano_banana_2 DOES accept --resolution (per `hf model get nano_banana_2`).
		expect(args[args.indexOf("--resolution") + 1]).toBe("2k");
		expect(args).toContain("--wait");
		expect(args).toContain("--json");
	});

	test("maps an explicit public model id to its CLI job_set_type", () => {
		const args = buildGenerateArgs({
			prompt: "p",
			model: "higgsfield-gpt-image-2",
		});
		expect(args.slice(0, 3)).toEqual(["generate", "create", "gpt_image_2"]);
	});

	test("gpt_image_2 keeps --quality (the model that accepts it)", () => {
		const args = buildGenerateArgs({
			prompt: "p",
			model: "higgsfield-gpt-image-2",
			quality: "high",
		});
		expect(args[args.indexOf("--quality") + 1]).toBe("high");
		expect(args[args.indexOf("--resolution") + 1]).toBe("2k");
	});

	test("emits a repeatable --image flag per reference image path", () => {
		const args = buildGenerateArgs({
			prompt: "p",
			referenceImagePaths: ["/a.png", "/b.png"],
		});
		const idxs = args.flatMap((a, i) => (a === "--image" ? [i] : []));
		expect(idxs.map((i) => args[i + 1])).toEqual(["/a.png", "/b.png"]);
	});
});

describe("toHiggsfieldAspect", () => {
	test("passes through supported ratios", () => {
		expect(toHiggsfieldAspect("9:16")).toBe("9:16");
		expect(toHiggsfieldAspect("1:1")).toBe("1:1");
	});
	test("maps unsupported ratios to the nearest supported (undefined → 16:9)", () => {
		expect(toHiggsfieldAspect("4:5")).toBe("3:4"); // portrait stays portrait, not 16:9
		expect(toHiggsfieldAspect("21:9")).toBe("16:9"); // 2.33 → nearest is 16:9
		expect(toHiggsfieldAspect(undefined)).toBe("16:9");
	});
});

describe("resolveHiggsfieldModel", () => {
	test("defaults to NanoBanana Pro (nano_banana_2)", () => {
		const prev = process.env.HIGGSFIELD_MODEL;
		delete process.env.HIGGSFIELD_MODEL;
		try {
			expect(DEFAULT_HIGGSFIELD_MODEL).toBe("nano_banana_2");
			expect(resolveHiggsfieldModel()).toBe("nano_banana_2");
		} finally {
			if (prev === undefined) delete process.env.HIGGSFIELD_MODEL;
			else process.env.HIGGSFIELD_MODEL = prev;
		}
	});

	test("maps public ids to CLI tokens", () => {
		expect(resolveHiggsfieldModel("higgsfield-nano-banana-pro")).toBe(
			"nano_banana_2",
		);
		expect(resolveHiggsfieldModel("higgsfield-gpt-image-2")).toBe(
			"gpt_image_2",
		);
	});

	test("HIGGSFIELD_MODEL env overrides the default for unmapped ids", () => {
		const prev = process.env.HIGGSFIELD_MODEL;
		process.env.HIGGSFIELD_MODEL = "flux_2";
		try {
			// bare/unknown public id falls through to the env
			expect(resolveHiggsfieldModel("higgsfield")).toBe("flux_2");
			expect(resolveHiggsfieldModel()).toBe("flux_2");
			// an explicit known public id still wins over the env
			expect(resolveHiggsfieldModel("higgsfield-gpt-image-2")).toBe(
				"gpt_image_2",
			);
		} finally {
			if (prev === undefined) delete process.env.HIGGSFIELD_MODEL;
			else process.env.HIGGSFIELD_MODEL = prev;
		}
	});
});

describe("extractImageUrl", () => {
	test("prefers the generated result_url over an attached input reference", () => {
		const parsed = [
			{
				id: "job1",
				status: "completed",
				result_url: "https://out.cdn/hf_generated.png",
				params: {
					medias: [{ data: { url: "https://in.cdn/uploaded-reference.png" } }],
				},
			},
		];
		expect(extractImageUrl(parsed)).toBe("https://out.cdn/hf_generated.png");
	});

	test("returns undefined when there is no URL at all", () => {
		expect(extractImageUrl([{ id: "job1", status: "done" }])).toBeUndefined();
	});
});

// ─── generateHiggsfieldImage (CLI behaviour via MODE token) ─────────────────────

describe("generateHiggsfieldImage", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		// Stub the download so we never touch the network.
		globalThis.fetch = (async (url: string) =>
			new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
				status: 200,
				headers: { "x-fetched-url": String(url) },
			})) as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("(a) success path returns a Buffer + image/png", async () => {
		const res = await generateHiggsfieldImage({ prompt: "MODE:success" });
		expect(Buffer.isBuffer(res.imageBuffer)).toBe(true);
		expect(res.imageBuffer.length).toBeGreaterThan(0);
		expect(res.mimeType).toBe("image/png");
		expect(res.finishReason).toBe("stop");
		expect(res.tokenUsage).toEqual({
			promptTokens: 0,
			candidateTokens: 0,
			totalTokens: 0,
		});
	});

	test("(b) downloads the generated output URL, not an attached input reference", async () => {
		let fetchedUrl = "";
		globalThis.fetch = (async (url: string) => {
			fetchedUrl = String(url);
			return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
				status: 200,
			});
		}) as unknown as typeof fetch;

		const res = await generateHiggsfieldImage({ prompt: "MODE:input" });
		expect(fetchedUrl).toBe("https://out.cdn/hf_generated.png");
		expect(res.mimeType).toBe("image/png");
	});

	test("(c) a non-zero CLI exit throws a typed HiggsfieldError", async () => {
		let caught: unknown;
		try {
			await generateHiggsfieldImage({ prompt: "MODE:cli" });
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(HiggsfieldError);
		expect(caught).toBeInstanceOf(HiggsfieldCliError);
	});
});

// Final cleanup of the fake binary dir.
process.on("exit", () => {
	try {
		rmSync(FAKE_DIR, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
});
