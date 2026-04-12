import { Hono } from "hono";
import { getAllGenerations, getGeneration, getImage } from "../db";

export const gallery = new Hono();

// GET /api/gallery — paginated list of generations
gallery.get("/", (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
	const offset = Number(c.req.query("offset")) || 0;

	const generations = getAllGenerations(limit, offset);
	return c.json({ data: generations, limit, offset });
});

// GET /api/gallery/:id — single generation details
gallery.get("/:id", (c) => {
	const id = c.req.param("id");
	const gen = getGeneration(id);

	if (!gen) {
		return c.json({ error: "Generation not found" }, 404);
	}

	return c.json(gen);
});

// GET /api/gallery/:id/image — serve binary image
gallery.get("/:id/image", async (c) => {
	const id = c.req.param("id");
	const gen = getGeneration(id);

	if (!gen) {
		return c.json({ error: "Generation not found" }, 404);
	}

	const file = Bun.file(gen.resultPath);
	if (!(await file.exists())) {
		return c.json({ error: "Image file not found on disk" }, 404);
	}

	const buffer = await file.arrayBuffer();
	const ext = gen.resultPath.split(".").pop();
	const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

	return new Response(buffer, {
		headers: {
			"Content-Type": mimeType,
			"Cache-Control": "public, max-age=86400",
		},
	});
});

// POST /api/gallery/:id/use-as-reference — return base64 for use as reference
gallery.post("/:id/use-as-reference", async (c) => {
	const id = c.req.param("id");
	const gen = getGeneration(id);

	if (!gen) {
		return c.json({ error: "Generation not found" }, 404);
	}

	const file = Bun.file(gen.resultPath);
	if (!(await file.exists())) {
		return c.json({ error: "Image file not found on disk" }, 404);
	}

	const buffer = await file.arrayBuffer();
	const base64 = Buffer.from(buffer).toString("base64");
	const ext = gen.resultPath.split(".").pop();
	const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

	return c.json({
		generationId: id,
		data: base64,
		mimeType,
	});
});
