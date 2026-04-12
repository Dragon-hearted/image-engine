---
system: image-engine
type: acceptance-criteria
version: 1
lastUpdated: "2026-04-12"
lastUpdatedBy: build-mode
---

# ImageEngine — Acceptance Criteria

## Hard Gates

### API & Generation
- [ ] POST /api/generate generates a single image via WisGate API and returns generation record with token usage
- [ ] POST /api/generate/batch accepts multiple prompts with dependency graph, executes parallel/sequential correctly
- [ ] WisGate client supports all 3 models: gemini-3-pro-image-preview, gemini-3.1-flash-image-preview, gemini-2.5-flash-image
- [ ] WisGate client supports up to 14 reference images as inline_data base64 parts
- [ ] WisGate client supports configurable aspectRatio and imageSize via imageConfig
- [ ] WisGate client supports systemInstruction for style guidance
- [ ] WisGate client supports multi-turn editing via conversationHistory
- [ ] WisGate client extracts usageMetadata.totalTokenCount from every response

### Rate Limiting & Budget
- [ ] Rate limiter returns 429 when request rate exceeds configured limit
- [ ] Token cost tracker records totalTokenCount for every successful generation in token_ledger table
- [ ] Budget guard returns 402 when cumulative token spend exceeds ceiling
- [ ] Budget guard returns X-Budget-Warning header when spend exceeds 80% of ceiling
- [ ] Budget guard can check WisGate account balance via GET /v1/users/me/balance

### Gallery
- [ ] GET /api/gallery returns paginated list of all generations
- [ ] GET /api/gallery/:id/image serves the generated image file
- [ ] POST /api/gallery/:id/use-as-reference returns generation image as base64 reference data

### Reliability
- [ ] Retry with exponential backoff on transient API failures (429, 5xx — max 3 retries; no retry on 400/401)
- [ ] Server starts on configured port with health check at GET /health
- [ ] Only runtime dependency is hono — no AI SDK packages
- [ ] TypeScript compiles with zero errors
- [ ] Biome lint passes with zero errors
