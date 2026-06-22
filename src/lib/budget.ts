/**
 * Per-(provider, model, modality) USD budget-line descriptor [ADR-0007, slice #38].
 *
 * Sibling to `capFor` (ref-cap.ts, ADR-0017): where `capFor` resolves the
 * reference-input cap, `budgetFor` resolves the dollar spend-line a provider is
 * gated against. The provider-scoped guard (builder-ie-guard) trips when
 * `getProviderSpend(serving) >= budgetFor(serving, model, 'image').limitUsd`.
 *
 * Routing mirrors `generate.ts` / `ref-cap.ts`: the canonical provider is
 * derived from the MODEL STRING first (the same `startsWith` order
 * `executeGeneration` uses — Higgsfield → OpenAI → WisGate), with `provider`
 * as a fallback hint only when the model string is unrecognized.
 *
 * // ponytail: a flat per-provider USD line (env-overridable) — NOT a pricing
 * engine. A per-model override table exists as a documented seam but is empty
 * by default. Keyed by `modality` so video lines slot in later (only 'image'
 * today). This is a budget *line*, not a cost calculator.
 */

export type BudgetModality = "image";

export interface BudgetLine {
	/** The cumulative-spend USD ceiling the guard trips on for this route. */
	limitUsd: number;
}

// Canonical provider keys — the strings stored in `provider_spend` and passed
// to get/addProviderSpend. Keep these in lockstep with generate.ts dispatch.
export const PROVIDER_HIGGSFIELD = "higgsfield";
export const PROVIDER_OPENAI = "openai";
export const PROVIDER_WISGATE = "wisgate";
export const PROVIDER_UNKNOWN = "unknown";

/**
 * Default per-provider USD budget-lines. Conservative, sensible defaults;
 * each is overridable via `IMAGE_ENGINE_BUDGET_<PROVIDER>_USD` (e.g.
 * `IMAGE_ENGINE_BUDGET_HIGGSFIELD_USD=25`). Higgsfield is the pricey CLI-credit
 * route, so its line is the tightest — it's the one a runaway cascade trips first.
 */
const DEFAULT_LINES: Record<string, number> = {
	[PROVIDER_HIGGSFIELD]: 10,
	[PROVIDER_OPENAI]: 20,
	[PROVIDER_WISGATE]: 25,
};

// Fallback line for an unrecognized provider — overridable via
// IMAGE_ENGINE_BUDGET_DEFAULT_USD. Documented safe default, not a guess.
const FALLBACK_LIMIT_USD = 10;

// ponytail: per-model overrides are a documented seam, empty by default — flat
// per-provider lines cover today's routes. Add an entry (lowercase model) only
// when one model on a provider genuinely needs a different ceiling.
const MODEL_OVERRIDES: Record<string, number> = {};

/** Resolve the canonical provider key from a model string (provider hint as fallback). */
export function providerOf(model: string, providerHint = ""): string {
	const m = model.toLowerCase();
	// Mirror executeGeneration / ref-cap order: Higgsfield CLI route first.
	if (m.startsWith("higgsfield")) return PROVIDER_HIGGSFIELD;
	if (m.startsWith("gpt-") || m.startsWith("gpt_")) return PROVIDER_OPENAI;
	if (
		m.startsWith("gemini") ||
		m.includes("nano_banana") ||
		m.includes("nano-banana")
	) {
		return PROVIDER_WISGATE;
	}
	// Fallback to the provider hint when the model string alone is unrecognized.
	const p = providerHint.toLowerCase();
	if (p.includes("higgsfield")) return PROVIDER_HIGGSFIELD;
	if (p.includes("openai") || p.includes("gpt")) return PROVIDER_OPENAI;
	if (p.includes("wisgate") || p.includes("gemini") || p.includes("nano")) {
		return PROVIDER_WISGATE;
	}
	return PROVIDER_UNKNOWN;
}

/** Per-provider line: env override (`IMAGE_ENGINE_BUDGET_<PROVIDER>_USD`) → default → fallback. */
function lineFor(provider: string): number {
	const envKey = `IMAGE_ENGINE_BUDGET_${provider.toUpperCase()}_USD`;
	const fromEnv = Number.parseFloat(process.env[envKey] ?? "");
	if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

	if (provider in DEFAULT_LINES) return DEFAULT_LINES[provider];

	const fromDefaultEnv = Number.parseFloat(
		process.env.IMAGE_ENGINE_BUDGET_DEFAULT_USD ?? "",
	);
	if (Number.isFinite(fromDefaultEnv) && fromDefaultEnv > 0)
		return fromDefaultEnv;
	return FALLBACK_LIMIT_USD;
}

/**
 * Resolve the USD budget-line for the chosen backend [ADR-0007].
 *
 * `model` is the primary key (route mirrors generate.ts); `provider` is a
 * fallback hint used only when the model string is unrecognized; `modality`
 * keys the table so video lines slot in later — only `'image'` today.
 *
 * @example budgetFor("higgsfield", "higgsfield-nano-banana-pro", "image") // { limitUsd: 10 }
 * @example budgetFor("wisgate", "gemini-2.5-flash-image", "image")        // { limitUsd: 25 }
 * @example budgetFor("openai", "gpt-image-2", "image")                    // { limitUsd: 20 }
 */
export function budgetFor(
	provider: string,
	model: string,
	modality: BudgetModality,
): BudgetLine {
	// modality is keyed for forward-compat (video lines later); only 'image' today.
	void modality;
	const override = MODEL_OVERRIDES[model.toLowerCase()];
	if (override !== undefined && override > 0) return { limitUsd: override };
	return { limitUsd: lineFor(providerOf(model, provider)) };
}
