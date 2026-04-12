import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { budget } from "./routes/budget";
import { gallery } from "./routes/gallery";
import { generate } from "./routes/generate";

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

const port = Number(process.env.IMAGE_ENGINE_PORT) || 3002;
console.log(`ImageEngine running on port ${port}`);

export default { port, fetch: app.fetch };
