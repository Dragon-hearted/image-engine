import { randomUUID } from "node:crypto";
import { getBudgetConfig, getTotalTokensSpent } from "../db";
import { executeGeneration } from "../routes/generate";
import type {
	BatchRequest,
	BatchResult,
	GenerationRequest,
	GenerationResult,
} from "../types";

const MAX_CONCURRENCY = 5;

// Semaphore for limiting concurrent API calls
class Semaphore {
	private queue: (() => void)[] = [];
	private current = 0;

	constructor(private max: number) {}

	async acquire(): Promise<void> {
		if (this.current < this.max) {
			this.current++;
			return;
		}
		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	release(): void {
		this.current--;
		const next = this.queue.shift();
		if (next) {
			this.current++;
			next();
		}
	}
}

// Topological sort using Kahn's algorithm
function topologicalSort(
	items: GenerationRequest[],
	dependencies?: { sceneId: string; dependsOn: string[] }[],
): GenerationRequest[][] {
	if (!dependencies?.length) {
		// No dependencies — all items can run in parallel
		return [items];
	}

	const depMap = new Map<string, Set<string>>();
	const reverseDeps = new Map<string, Set<string>>();

	for (const dep of dependencies) {
		depMap.set(dep.sceneId, new Set(dep.dependsOn));
		for (const d of dep.dependsOn) {
			if (!reverseDeps.has(d)) reverseDeps.set(d, new Set());
			reverseDeps.get(d)?.add(dep.sceneId);
		}
	}

	// Build scene-to-item map
	const sceneItems = new Map<string, GenerationRequest>();
	const noSceneItems: GenerationRequest[] = [];
	for (const item of items) {
		if (item.sceneId) {
			sceneItems.set(item.sceneId, item);
		} else {
			noSceneItems.push(item);
		}
	}

	// Compute in-degree
	const inDegree = new Map<string, number>();
	for (const item of items) {
		if (item.sceneId) {
			const deps = depMap.get(item.sceneId);
			inDegree.set(item.sceneId, deps?.size ?? 0);
		}
	}

	const layers: GenerationRequest[][] = [];

	// Items with no sceneId go in the first layer
	if (noSceneItems.length > 0) {
		layers.push(noSceneItems);
	}

	// Process scene items in topological order
	const remaining = new Set(
		items.filter((i) => i.sceneId).map((i) => i.sceneId!),
	);

	while (remaining.size > 0) {
		const layer: GenerationRequest[] = [];

		for (const sceneId of remaining) {
			if ((inDegree.get(sceneId) ?? 0) === 0) {
				const item = sceneItems.get(sceneId);
				if (item) layer.push(item);
			}
		}

		if (layer.length === 0) {
			// Circular dependency — push remaining items as final layer
			for (const sceneId of remaining) {
				const item = sceneItems.get(sceneId);
				if (item) layer.push(item);
			}
			layers.push(layer);
			break;
		}

		// Remove processed items and decrement in-degree for dependents
		for (const item of layer) {
			remaining.delete(item.sceneId!);
			const deps = reverseDeps.get(item.sceneId!);
			if (deps) {
				for (const dep of deps) {
					inDegree.set(dep, (inDegree.get(dep) ?? 1) - 1);
				}
			}
		}

		layers.push(layer);
	}

	return layers;
}

async function executeItem(
	request: GenerationRequest,
	semaphore: Semaphore,
): Promise<GenerationResult | { error: string }> {
	// Budget check before each item
	const config = getBudgetConfig();
	if (config?.isActive) {
		const spent = getTotalTokensSpent();
		if (spent >= config.tokenCeiling) {
			return { error: "Budget ceiling exceeded" };
		}
	}

	await semaphore.acquire();
	try {
		return await executeGeneration(request);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { error: message };
	} finally {
		semaphore.release();
	}
}

export async function executeBatch(batch: BatchRequest): Promise<BatchResult> {
	const semaphore = new Semaphore(MAX_CONCURRENCY);
	const results: Record<string, GenerationResult | { error: string }> = {};
	let totalTokens = 0;

	const layers = topologicalSort(batch.items, batch.dependencies);

	for (const layer of layers) {
		// Execute all items in the layer concurrently (bounded by semaphore)
		const layerResults = await Promise.all(
			layer.map(async (item) => {
				const key = item.sceneId ?? randomUUID();
				const result = await executeItem(item, semaphore);
				return { key, result };
			}),
		);

		for (const { key, result } of layerResults) {
			results[key] = result;
			if ("tokenUsage" in result) {
				totalTokens += result.tokenUsage.totalTokens;
			}
		}
	}

	return { results, totalTokens };
}
