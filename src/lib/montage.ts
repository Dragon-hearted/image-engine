import sharp from "sharp";

/**
 * Deterministic local montage of an overflow reference tail (ADR-0017).
 *
 * Resizes each ref to a fixed cell and tiles them into a fixed grid (input
 * order) → ONE composite PNG. Fully deterministic: fixed cell dims, fixed grid,
 * fixed background, pinned PNG encoding, no Date/random/metadata → the same
 * inputs produce a byte-identical buffer. This blend cannot 402/timeout/fail
 * beyond malformed input, which is the only failure surface.
 *
 * // ponytail: v1 montage is category-blind — it tiles whatever overflows.
 * Typed sub-cap enforcement (6 objects + 5 humans) is carried by the cap
 * descriptor but NOT enforced here; deferred per ADR-0017.
 */

/** Fixed cell size (px). Pinned for determinism. */
const CELL = 512;
/** Fixed, opaque background behind cells. Pinned for determinism. */
const BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 } as const;

/** The sole failure surface: empty or undecodable input. */
export class MontageInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MontageInputError";
	}
}

export async function montage(
	tail: Array<{ data: string; mimeType: string }>,
): Promise<{ data: string; mimeType: "image/png" }> {
	if (!Array.isArray(tail) || tail.length === 0) {
		throw new MontageInputError(
			"montage requires at least one reference image",
		);
	}

	const cols = Math.ceil(Math.sqrt(tail.length));
	const rows = Math.ceil(tail.length / cols);

	// Decode + resize each ref to a fixed cell, in input order.
	const cells = await Promise.all(
		tail.map(async (ref, i) => {
			const buf = Buffer.from(ref.data ?? "", "base64");
			try {
				return await sharp(buf)
					.resize(CELL, CELL, { fit: "cover", position: "centre" })
					.png({ compressionLevel: 9, adaptiveFiltering: false })
					.toBuffer();
			} catch {
				throw new MontageInputError(
					`reference at index ${i} could not be decoded as an image`,
				);
			}
		}),
	);

	// Place cells left-to-right, top-to-bottom in input order on a fixed canvas.
	const composites = cells.map((input, i) => ({
		input,
		left: (i % cols) * CELL,
		top: Math.floor(i / cols) * CELL,
	}));

	const out = await sharp({
		create: {
			width: cols * CELL,
			height: rows * CELL,
			channels: 4,
			background: BACKGROUND,
		},
	})
		.composite(composites)
		.png({ compressionLevel: 9, adaptiveFiltering: false })
		.toBuffer();

	return { data: out.toString("base64"), mimeType: "image/png" };
}
