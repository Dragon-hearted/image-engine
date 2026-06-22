/**
 * Per-(provider, model, modality) reference-input cap descriptor [ADR-0017].
 *
 * image-engine has no reference-count cap today — `executeGeneration` passes
 * refs through with only a per-image 10 MB size check (`generate.ts:99-104`).
 * This descriptor is the seam the overflow resolver triggers on: it resolves
 * the chosen backend's reference-input limit so the resolver can collapse the
 * overflow tail into a deterministic montage.
 *
 * Routing mirrors `generate.ts`: the route is derived from the MODEL STRING
 * (the same `startsWith` checks `executeGeneration` uses), in the same order
 * Higgsfield → OpenAI → WisGate. `provider` is accepted for forward-compat and
 * used ONLY as a fallback hint when the model string is unrecognized.
 */

export type RefCapModality = "image";

export interface RefCap {
	/** The scalar reference-input cap the resolver triggers on. */
	total: number;
	/**
	 * Typed sub-caps for routes that distinguish ref categories (WisGate
	 * NanoBanana = 6 objects + 5 humans).
	 *
	 * // ponytail: carried in the descriptor but NOT enforced in v1 — the
	 * resolver is category-blind and triggers on `total` only. Honest typed
	 * enforcement (don't montage humans into one slot) is a documented ADR-0017
	 * refinement, deferred because the default route is scalar-8 anyway.
	 */
	byCategory?: { objects: number; humans: number };
}

// Pinned per-route descriptors [ADR-0017].
const HIGGSFIELD_CAP: RefCap = { total: 8 }; // Higgsfield CLI ~8 (higgsfield-provider.ts:59)
const WISGATE_NANOBANANA_CAP: RefCap = {
	total: 14,
	byCategory: { objects: 6, humans: 5 },
}; // WisGate/Gemini NanoBanana Pro 14 = 6 objects + 5 humans
const OPENAI_GPT_IMAGE_CAP: RefCap = { total: 3 }; // gpt-image-2 / gpt_image_2

// ponytail: unknown models get the default-route cap (Higgsfield CLI 8), since
// `higgsfield-nano-banana-pro` is image-engine's DEFAULT_MODEL — an unknown
// model most likely rides the default path, and 8 is the conservative-but-real
// common cap. Documented safe default, not a guess.
const SAFE_DEFAULT_CAP: RefCap = { total: 8 };

/** Decide the cap from the model string — mirrors generate.ts's startsWith order. */
function routeFromModel(model: string): RefCap | null {
	const m = model.toLowerCase();
	// Higgsfield CLI route first (incl. the default higgsfield-nano-banana-pro
	// and higgsfield-gpt-image-2), matching `isHiggsfield` being checked before
	// `isOpenAI` in executeGeneration.
	if (m.startsWith("higgsfield")) return HIGGSFIELD_CAP;
	// OpenAI Images route — both the hyphen (`gpt-image-2`) and underscore
	// (`gpt_image_2`) spellings seen across the repo.
	if (m.startsWith("gpt-") || m.startsWith("gpt_")) return OPENAI_GPT_IMAGE_CAP;
	// WisGate NanoBanana route — gemini-* models, plus the `nano_banana` /
	// `nano-banana` identifiers used elsewhere for the same backend.
	if (
		m.startsWith("gemini") ||
		m.includes("nano_banana") ||
		m.includes("nano-banana")
	) {
		return WISGATE_NANOBANANA_CAP;
	}
	return null;
}

/** Fallback hint when the model string alone is unrecognized. */
function routeFromProvider(provider: string): RefCap | null {
	const p = provider.toLowerCase();
	if (p.includes("higgsfield")) return HIGGSFIELD_CAP;
	if (p.includes("openai") || p.includes("gpt")) return OPENAI_GPT_IMAGE_CAP;
	if (p.includes("wisgate") || p.includes("gemini") || p.includes("nano")) {
		return WISGATE_NANOBANANA_CAP;
	}
	return null;
}

/**
 * Resolve the reference-input cap for the chosen backend [ADR-0017].
 *
 * `model` is the primary key (route mirrors generate.ts); `provider` is a
 * fallback hint used only when the model string is unrecognized; `modality`
 * keys the table so video caps slot in later — only `'image'` exists today.
 *
 * @example capFor("higgsfield", "higgsfield-nano-banana-pro", "image") // { total: 8 }
 * @example capFor("wisgate", "gemini-2.5-flash-image", "image")        // { total: 14, byCategory: {...} }
 * @example capFor("openai", "gpt-image-2", "image")                    // { total: 3 }
 */
export function capFor(
	provider: string,
	model: string,
	modality: RefCapModality,
): RefCap {
	// modality is keyed for forward-compat (video caps later); only 'image' today.
	void modality;
	return (
		routeFromModel(model) ?? routeFromProvider(provider) ?? SAFE_DEFAULT_CAP
	);
}
