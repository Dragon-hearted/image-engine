import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getBudgetConfig, updateDollarBudget } from "./db";
import { budget } from "./routes/budget";
import { gallery } from "./routes/gallery";
import { generate } from "./routes/generate";
import { checkBalance } from "./wisgate";

// Ensure uploads directory exists
const UPLOADS_DIR = join(import.meta.dir, "../uploads");
if (!existsSync(UPLOADS_DIR)) {
	mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = new Hono();

// CORS middleware
app.use(
	"*",
	cors({
		origin: [
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:3000",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "X-Budget-Override"],
	}),
);

// Health check
app.get("/health", (c) => c.text("ImageEngine API"));

// Mount routes
app.route("/api/generate", generate);
app.route("/api/gallery", gallery);
app.route("/api/budget", budget);

async function syncBudgetWithWisGate(): Promise<void> {
	const config = getBudgetConfig();
	if (!config || !config.isActive) return;
	try {
		const balance = await checkBalance();
		const remaining = balance.available_balance;
		// Top-up = highest balance ever observed. Bumps when user refills.
		const prevTopUp = config.dollarTopUp ?? 0;
		const topUp = Math.max(prevTopUp, remaining);
		updateDollarBudget(topUp, remaining);
		const spent = Math.max(0, topUp - remaining);
		const symbol = config.currencySymbol ?? "$";
		console.log(
			`Budget synced: ${symbol}${spent.toFixed(2)} / ${symbol}${topUp.toFixed(2)} spent (remaining=${symbol}${remaining.toFixed(2)})`,
		);
	} catch (err) {
		console.warn(
			`Budget sync skipped: ${err instanceof Error ? err.message : err}`,
		);
	}
}

await syncBudgetWithWisGate();

const port = Number(process.env.IMAGE_ENGINE_PORT) || 3002;
console.log(`ImageEngine running on port ${port}`);

export default { port, fetch: app.fetch };
