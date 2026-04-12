import { Hono } from "hono";
import { getTokenHistory, updateBudgetCeiling } from "../db";
import { getBudgetStatus } from "../middleware/budget-guard";
import { checkBalance } from "../wisgate";

export const budget = new Hono();

// GET /api/budget — current budget status
budget.get("/", async (c) => {
	const includeWisGate = c.req.query("wisgate") === "true";
	const status = await getBudgetStatus(includeWisGate);
	return c.json(status);
});

// PUT /api/budget/ceiling — update token ceiling
budget.put("/ceiling", async (c) => {
	const body = await c.req.json<{ ceiling: number }>();

	if (typeof body.ceiling !== "number" || body.ceiling < 0) {
		return c.json({ error: "ceiling must be a non-negative number" }, 400);
	}

	updateBudgetCeiling(body.ceiling);
	const status = await getBudgetStatus(false);
	return c.json(status);
});

// GET /api/budget/history — token usage history with optional date range
budget.get("/history", (c) => {
	const from = c.req.query("from");
	const to = c.req.query("to");
	const records = getTokenHistory(from, to);
	return c.json({ data: records });
});

// GET /api/budget/wisgate-balance — live WisGate balance
budget.get("/wisgate-balance", async (c) => {
	const balance = await checkBalance();
	return c.json(balance);
});
