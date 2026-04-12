import type { MiddlewareHandler } from "hono";

// Token bucket algorithm
// - capacity: max tokens (configurable, default from IMAGE_ENGINE_RATE_LIMIT env or 10)
// - refillRate: tokens added per interval
// - interval: refill period (1 minute = 60000ms)
// State stored in-memory (resets on restart — acceptable for single-server)

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

export function rateLimiter(capacity?: number): MiddlewareHandler {
	const maxTokens =
		(capacity ?? Number(process.env.IMAGE_ENGINE_RATE_LIMIT)) || 10;
	const bucket: TokenBucket = { tokens: maxTokens, lastRefill: Date.now() };
	const intervalMs = 60_000; // 1 minute

	return async (c, next) => {
		// Refill tokens based on elapsed time
		const now = Date.now();
		const elapsed = now - bucket.lastRefill;
		const tokensToAdd = Math.floor((elapsed / intervalMs) * maxTokens);
		if (tokensToAdd > 0) {
			bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
			bucket.lastRefill = now;
		}

		// Check if token available
		if (bucket.tokens <= 0) {
			const retryAfter = Math.ceil(
				(intervalMs - (now - bucket.lastRefill)) / 1000,
			);
			c.header("Retry-After", String(retryAfter));
			return c.json({ error: "Rate limit exceeded", retryAfter }, 429);
		}

		// Consume a token
		bucket.tokens -= 1;

		// Set rate limit headers
		c.header("X-RateLimit-Limit", String(maxTokens));
		c.header("X-RateLimit-Remaining", String(bucket.tokens));

		await next();
	};
}
