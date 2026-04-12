---
system: "image-engine"
type: scope
version: 1
lastUpdated: "2026-04-12"
lastUpdatedBy: build-mode
---

# ImageEngine — Scope

## Description
Centralized NanoBanana image generation service using WisGate (JuheAPI) as the API provider, with rate limiting, token-based cost tracking, budget guards, retry/backoff, batch parallel execution, and generation gallery.

## In Scope
- Single image generation via WisGate API (3 model tiers)
- Batch image generation with parallel execution and dependency resolution
- Reference images (up to 14 per request) as inline base64 data
- Multi-turn editing via conversation history
- Token-based cost tracking from usageMetadata.totalTokenCount
- Budget ceiling enforcement (soft warning at 80%, hard stop at 100%)
- WisGate account balance checking
- Rate limiting (configurable requests/minute)
- Retry with exponential backoff on transient failures
- Generation gallery with image persistence (SQLite + disk)
- Configurable aspect ratios and image sizes

## Out of Scope
- Frontend/UI (API only)
- Video generation (image only)
- Direct Gemini/Google AI SDK usage (plain fetch only)
- Multi-tenant / auth (single-user, single-key)

## Inputs
- Text prompt
- Optional reference images (base64)
- Model selection
- Generation config (aspect ratio, image size, force image)

## Outputs
- Generated images (PNG/JPEG)
- Token usage metadata
- Budget status
- Generation gallery
