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

		const topUp = config.dollarTopUp ?? 0;
		const remaining = config.dollarsLastSeen ?? 0;
		const spent = Math.max(0, topUp - remaining);
		const percentUsed =
			topUp > 0 ? Math.round((spent / topUp) * 100) : 0;
		const symbol = config.currencySymbol ?? "$";

		// Hard stop when WisGate balance is exhausted
		if (topUp > 0 && remaining <= 0) {
			return c.json(
				{
					error: "Budget ceiling exceeded",
					spent,
					ceiling: topUp,
					remaining: 0,
					percentUsed,
					currencySymbol: symbol,
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
		c.header("X-Budget-Spent", spent.toFixed(4));
		c.header("X-Budget-Remaining", remaining.toFixed(4));

		await next();
	};
}

// Utility: get current budget status (used by budget routes)
export async function getBudgetStatus(
	includeWisGate = false,
): Promise<BudgetStatus> {
	const config = getBudgetConfig();
	const tokensSpent = getTotalTokensSpent();
	const tokenCeiling = config?.tokenCeiling ?? 0;
	const tokensRemaining = Math.max(0, tokenCeiling - tokensSpent);

	const dollarsCeiling = config?.dollarTopUp ?? 0;
	const dollarsRemaining = config?.dollarsLastSeen ?? 0;
	const dollarsSpent = Math.max(0, dollarsCeiling - dollarsRemaining);
	const percentUsed =
		dollarsCeiling > 0
			? Math.round((dollarsSpent / dollarsCeiling) * 100)
			: 0;

	const status: BudgetStatus = {
		tokenCeiling,
		tokensSpent,
		tokensRemaining,
		percentUsed,
		isActive: config?.isActive === 1,
		dollarsCeiling,
		dollarsSpent,
		dollarsRemaining,
		currencySymbol: config?.currencySymbol ?? "$",
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
