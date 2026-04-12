import type { MiddlewareHandler } from "hono";
import { getBudgetConfig, getTotalTokensSpent } from "../db";
import type { BudgetStatus } from "../types";
import { checkBalance } from "../wisgate";

export function budgetGuard(): MiddlewareHandler {
	return async (c, next) => {
		// Allow override via header
		const override = c.req.header("X-Budget-Override");
		if (override === "true") {
			await next();
			return;
		}

		const config = getBudgetConfig();
		if (!config || !config.isActive) {
			await next();
			return;
		}

		const tokensSpent = getTotalTokensSpent();
		const tokensRemaining = config.tokenCeiling - tokensSpent;
		const percentUsed =
			config.tokenCeiling > 0
				? Math.round((tokensSpent / config.tokenCeiling) * 100)
				: 0;

		// Hard stop at 100%
		if (tokensSpent >= config.tokenCeiling) {
			return c.json(
				{
					error: "Budget ceiling exceeded",
					spent: tokensSpent,
					ceiling: config.tokenCeiling,
					remaining: 0,
					percentUsed,
				} satisfies Record<string, unknown>,
				402,
			);
		}

		// Soft warning at warnAtPercent (default 80%)
		if (percentUsed >= config.warnAtPercent) {
			c.header(
				"X-Budget-Warning",
				`approaching ceiling (${percentUsed}% used)`,
			);
		}

		// Set budget info headers
		c.header("X-Budget-Spent", String(tokensSpent));
		c.header("X-Budget-Remaining", String(tokensRemaining));

		await next();
	};
}

// Utility: get current budget status (used by budget routes)
export async function getBudgetStatus(
	includeWisGate = false,
): Promise<BudgetStatus> {
	const config = getBudgetConfig();
	const tokensSpent = getTotalTokensSpent();
	const ceiling = config?.tokenCeiling ?? 0;
	const remaining = Math.max(0, ceiling - tokensSpent);
	const percentUsed =
		ceiling > 0 ? Math.round((tokensSpent / ceiling) * 100) : 0;

	const status: BudgetStatus = {
		tokenCeiling: ceiling,
		tokensSpent,
		tokensRemaining: remaining,
		percentUsed,
		isActive: config?.isActive === 1,
	};

	if (includeWisGate) {
		try {
			status.wisGateBalance = await checkBalance();
		} catch {
			// WisGate balance check is best-effort
		}
	}

	return status;
}
