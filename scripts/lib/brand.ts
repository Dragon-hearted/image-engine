import { brandContextPrompt } from "../../vendor/design-system/adapters/ai-brand";

/** Returns the prompt with the DS brand block prepended when `--brand` is in argv. */
export function applyBrandFlag(prompt: string, argv: string[] = process.argv): string {
	if (!argv.includes("--brand")) return prompt;
	const block = brandContextPrompt({ surface: "product-shot" });
	return `${block}\n\n${prompt}`;
}
