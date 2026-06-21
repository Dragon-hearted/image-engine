import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import { montage, MontageInputError } from "../src/lib/montage";

/** Build a solid-color PNG fixture inline (no external assets). */
async function solidPng(
	r: number,
	g: number,
	b: number,
	size = 64,
): Promise<{ data: string; mimeType: string }> {
	const buf = await sharp({
		create: { width: size, height: size, channels: 3, background: { r, g, b } },
	})
		.png()
		.toBuffer();
	return { data: buf.toString("base64"), mimeType: "image/png" };
}

const sha = (b64: string) => createHash("sha256").update(b64).digest("hex");

describe("montage", () => {
	it("composites a tail of refs into one PNG", async () => {
		const tail = [await solidPng(255, 0, 0), await solidPng(0, 0, 255)];
		const out = await montage(tail);

		expect(out.mimeType).toBe("image/png");
		const meta = await sharp(Buffer.from(out.data, "base64")).metadata();
		expect(meta.format).toBe("png");
		// 2 refs → ceil(sqrt(2)) = 2 cols, 1 row → 1024×512 at 512px cells.
		expect(meta.width).toBe(1024);
		expect(meta.height).toBe(512);
	});

	it("is deterministic: same inputs → byte-identical output", async () => {
		const tail = [
			await solidPng(255, 0, 0),
			await solidPng(0, 255, 0),
			await solidPng(0, 0, 255),
		];
		const first = await montage(tail);
		const second = await montage(tail);

		expect(sha(first.data)).toBe(sha(second.data));
		expect(first.data).toBe(second.data);
	});

	it("throws MontageInputError on empty input", async () => {
		await expect(montage([])).rejects.toBeInstanceOf(MontageInputError);
	});

	it("throws MontageInputError on undecodable input", async () => {
		await expect(
			montage([{ data: "not-an-image", mimeType: "image/png" }]),
		).rejects.toBeInstanceOf(MontageInputError);
	});
});
