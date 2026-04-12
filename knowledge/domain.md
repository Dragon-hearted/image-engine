---
system: "image-engine"
type: domain
version: 1
lastUpdated: "2026-04-12"
lastUpdatedBy: build-mode
---

# ImageEngine — Domain Knowledge

## Overview
ImageEngine is the centralized NanoBanana image generation service using WisGate (JuheAPI) as the API provider. It serves as the single gateway for all systems needing image generation, with full operational safety: rate limiting, token-based cost tracking, budget guards, retry/backoff, and a generation gallery.

## WisGate API
- **Base URL**: `https://api.wisgate.ai`
- **Endpoint**: `POST /v1beta/models/{model}:generateContent`
- **Auth**: `x-goog-api-key` header with `WISDOM_GATE_KEY` env var
- **No SDK needed** — plain `fetch` calls

## Models
| Model | Description | Resolutions | Use Case |
|-------|-------------|-------------|----------|
| `gemini-3-pro-image-preview` | Full-featured, best quality | 1K, 2K, 4K | Final output |
| `gemini-3.1-flash-image-preview` | High-efficiency (Nano Banana 2) | 0.5K, 1K, 2K, 4K | Fast iteration |
| `gemini-2.5-flash-image` | Fast and economical | 1K, 2K | Budget-conscious |

## Reference Images
- Up to **14 per request** (6 objects + 5 humans)
- Passed as `inline_data` with base64-encoded data and `mime_type`
- Also supports referencing a previous generation by ID from the gallery

## Multi-Turn Editing
- Conversation context via `contents` array with `role: "user"` and `role: "model"` turns
- Enables iterative refinement of generated images

## Aspect Ratios
1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
(`gemini-3.1-flash-image-preview` also supports 1:4, 1:8, 4:1, 8:1)

## Image Size
Configurable via `imageConfig.imageSize`: 0.5K, 1K, 2K, 4K (model-dependent)

## Force Image Output
Set `responseModalities: ["IMAGE"]` (without TEXT) to guarantee image generation.

## Response Format
`candidates[0].content.parts[]` — each part is either `{text: string}` or `{inlineData: {mimeType: string, data: string}}` (base64)

## Token Tracking
Every response includes `usageMetadata` with `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`.

## Balance API
`GET https://api.wisgate.ai/v1/users/me/balance` with Bearer auth returns balance info.

## Error Codes
- 400: bad request
- 401: invalid API key
- 429: rate limit exceeded

## Cost Optimization
- Gemini 2.5 Flash Image consumes ~1,290 tokens per image
- Lower resolutions consume fewer tokens
- Use Flash models for iterations, Pro for final output

## Failure Modes
- API timeout
- 429 rate limit
- Invalid prompt
- Budget exceeded
- Network errors
- Safety filter blocks (finishReason: SAFETY)

## Environment Variables
- `WISDOM_GATE_KEY` — WisGate API key
- `IMAGE_ENGINE_PORT` — Server port (default 3002)
- `IMAGE_ENGINE_TOKEN_CEILING` — Budget ceiling in tokens (default 100000)
- `IMAGE_ENGINE_RATE_LIMIT` — Requests per minute (default 10)
