<div align="center">

![ImageEngine](images/hero.svg)

### Centralized NanoBanana image-generation gateway over WisGate

![Status](https://img.shields.io/badge/Status-active-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗 Architecture](#-architecture)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [🚀 Usage](#-usage)
- [⚙️ Configuration](#️-configuration)
- [💻 Development](#-development)
- [📡 API Reference](#-api-reference)
- [📂 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Single image generation** | POST /api/generate turns a text prompt into an image via WisGate, persists it to disk + SQLite, and returns the generation record with token usage. |
| **Batch generation with dependency graph** | POST /api/generate/batch runs many prompts at once. A Kahn topological sort orders items by an optional sceneId dependency graph into layers; each layer runs concurrently (semaphore, max 5). Partial failures are captured per-item as {error} rather than failing the whole batch; circular deps are handled gracefully. |
| **Multi-provider model routing** | One endpoint, three providers. Higgsfield (higgsfield-gpt-image-2 — **the default**) shells out to the local `higgsfield` CLI (GPT Image 2); Gemini models (gemini-3-pro-image-preview, gemini-3.1-flash-image-preview, gemini-2.5-flash-image) call WisGate's generateContent API; OpenAI models (gpt-image-2, gpt-image-1.5) route to WisGate's OpenAI-compatible /v1/images/generations. Selection is automatic: omit `model` (or pass one starting with 'higgsfield') for Higgsfield, names starting with 'gpt-' use the OpenAI path, everything else is Gemini. Gemini/OpenAI share one WISDOM_GATE_KEY. **Any caller that omits `model` now gets Higgsfield**; if a Higgsfield generation fails (unauth/timeout/CLI/no-URL) it automatically falls back to `gemini-2.5-flash-image`, and the gallery/ledger record the provider actually served. Higgsfield reports no token accounting, so its generations record zero token usage. |
| **Reference images (image-to-image)** | Supply references two ways: inline base64 via referenceImages[] (each capped ~10 MB binary / 14M base64 chars) or referenceImageIds[] that are resolved against the IMAGES table via getImage() (NOT the generations table). Up to 14 references per request (6 objects + 5 humans per WisGate). Gemini path only; ignored for OpenAI models. |
| **Multi-turn conversational editing** | conversationHistory[] (Gemini role/parts content) lets you iteratively refine an image across turns. Gemini path only. |
| **Generation controls** | aspectRatio (14 ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, plus 1:4/1:8/4:1/8:1 on flash), imageSize (0.5K/1K/2K/4K), forceImage (image-only output), systemInstruction (style guidance), and openaiQuality (low/medium/high, default high) for OpenAI models. |
| **Rate limiting** | Token-bucket limiter on /api/generate* — default 10 requests/minute (IMAGE_ENGINE_RATE_LIMIT), 60s window, refilled proportionally. Over-limit requests get HTTP 429 with a Retry-After header; every response carries X-RateLimit-Limit / X-RateLimit-Remaining. State is a single in-memory bucket per process (resets on restart; not per-IP). |
| **Budget guard + token ledger** | Two-layer cost control. (1) Dollar guard middleware on /api/generate*: hard-stops with HTTP 402 when the synced WisGate balance is exhausted, sets X-Budget-Warning past warnAtPercent (default 80%) and X-Budget-Spent/Remaining headers; bypass with header X-Budget-Override: true. (2) Token ceiling (IMAGE_ENGINE_TOKEN_CEILING, default 100000) enforced inside the batch executor against a SQLite token_ledger summing every generation's totalTokenCount. |
| **Startup balance sync** | On boot the server calls WisGate's balance API and records dollarTopUp (highest balance ever seen) and dollarsLastSeen into budget_config, logging 'Budget synced: $spent / $topUp'. Best-effort — failures are logged and ignored. |
| **Generation gallery** | Browse and reuse past work: GET /api/gallery (paginated, limit capped at 100), GET /api/gallery/:id (record), GET /api/gallery/:id/image (raw bytes, cached 24h), POST /api/gallery/:id/use-as-reference (returns the image as base64 to feed back as a reference). |
| **Budget API** | GET /api/budget (status: token + dollar ceilings/spend/remaining; ?wisgate=true to include live balance), PUT /api/budget/ceiling (update token ceiling), GET /api/budget/history (token_ledger, optional from/to), GET /api/budget/wisgate-balance (live balance). |
| **Retry with exponential backoff** | Both providers retry up to 3 times on 429/5xx with exponential backoff (2s/4s/8s); 400 and 401 fail fast with no retry. Gemini SAFETY finishReason surfaces a clear 'blocked by safety filters' error. |
| **Local persistence** | SQLite (Bun built-in, WAL mode) at ./imageengine.db with tables generations, images, token_ledger, budget_config; generated image bytes written to ./uploads/<uuid>.(png\|jpg). |
| **Health check** | GET /health returns 200 'ImageEngine API' — no key required, suitable for liveness probes. |

---

## 🏗 Architecture

![Pipeline](images/pipeline.svg)

ImageEngine processes data through a multi-stage pipeline.

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| **TypeScript 5.7** | Type safety |
| **Bun** | JavaScript runtime & package manager |
| **Hono 4** | Lightweight web framework |

---

## 🚀 Getting Started

### Prerequisites

- Bun v1.0+ — curl -fsSL https://bun.sh/install | bash
- **Higgsfield CLI (HOST prerequisite for the default provider)** — `npm install -g @higgsfield/cli`, then authenticate once with `higgsfield auth login`. The default model `higgsfield-gpt-image-2` shells out to this binary; without it (or its auth) Higgsfield generations fall back to `gemini-2.5-flash-image`. Override the binary path with `HIGGSFIELD_BIN` if it isn't on `PATH`.
- A WisGate (JuheAPI) account key set as WISDOM_GATE_KEY in systems/image-engine/.env (re-read from .env on every call, so rotating it needs no restart) — required for the Gemini/OpenAI models and the Higgsfield → gemini fallback
- For real Gemini/OpenAI generation (and the Higgsfield fallback): a positive WisGate dollar balance — when the balance is exhausted the budget guard hard-stops generation with HTTP 402

### Install

```bash
cd systems/image-engine
bun install
```

---

## 🚀 Usage

### 1. Start the server

```bash
cd systems/image-engine && bun src/index.ts   # or: just start  (watch mode: just dev)
```

> **Expected:** Logs 'Budget synced: $<spent> / $<topUp>' then 'ImageEngine running on port 3002'. Requires WISDOM_GATE_KEY in .env for the startup balance sync (sync is best-effort and won't block boot).

### 2. Confirm the service is up

```bash
curl -s localhost:3002/health
```

> **Expected:** HTTP 200, body 'ImageEngine API'. (Verified.)

### 3. Browse the generation gallery

```bash
curl -s 'localhost:3002/api/gallery?limit=5'
```

> **Expected:** HTTP 200 JSON {data:[...generations], limit, offset}. (Verified — returns existing generations, e.g. gpt-image-2 records.)

### 4. Check budget status

```bash
curl -s 'localhost:3002/api/budget?wisgate=true'
```

> **Expected:** HTTP 200 JSON BudgetStatus {tokenCeiling, tokensSpent, tokensRemaining, percentUsed, dollarsCeiling, dollarsSpent, dollarsRemaining, currencySymbol, wisGateBalance?}. (Verified.)

### 5. Generate a single image (default provider — Higgsfield)

```bash
curl -s -X POST localhost:3002/api/generate -H 'content-type: application/json' -d '{"prompt":"a red bicycle on a white studio backdrop","aspectRatio":"1:1"}'
```

> **Expected:** HTTP 201 GenerationResult {id, imageUrl:'/api/gallery/<id>/image', model, prompt, tokenUsage, createdAt}. With no `model`, ImageEngine routes to Higgsfield (`higgsfield-gpt-image-2`) via the local `higgsfield` CLI; aspectRatio maps to the Higgsfield enum (unsupported ratios collapse to 16:9). `tokenUsage` is zero (the CLI reports none). If the CLI is missing/unauthenticated or the job fails, the response transparently falls back to `gemini-2.5-flash-image` and `model` in the result reflects the served provider. Requires the `higgsfield` CLI authenticated on the host.

### 6. Generate a single image (WisGate / Gemini)

```bash
curl -s -X POST localhost:3002/api/generate -H 'content-type: application/json' -d '{"prompt":"a red bicycle on a white studio backdrop","model":"gemini-2.5-flash-image","aspectRatio":"1:1"}'
```

> **Expected:** HTTP 201 GenerationResult {id, imageUrl:'/api/gallery/<id>/image', model, prompt, tokenUsage, createdAt}. Requires WISDOM_GATE_KEY AND a positive WisGate balance — NOT executed (the test environment's balance is exhausted, so the dollar budget guard returns HTTP 402 'Budget ceiling exceeded' before generation). Bypass for testing only with header 'X-Budget-Override: true'.

### 7. Generate a single image (OpenAI-compatible)

```bash
curl -s -X POST localhost:3002/api/generate -H 'content-type: application/json' -d '{"prompt":"product photo of a sneaker","model":"gpt-image-2","aspectRatio":"16:9","openaiQuality":"high"}'
```

> **Expected:** HTTP 201 GenerationResult. Routes to WisGate's /v1/images/generations; aspectRatio maps to a pixel size (1024x1024 / 1024x1536 / 1536x1024). Requires WISDOM_GATE_KEY + balance — NOT executed (credential/budget-gated).

### 8. Batch generate with a dependency graph

```bash
curl -s -X POST localhost:3002/api/generate/batch -H 'content-type: application/json' -d '{"items":[{"prompt":"establishing shot","sceneId":"s1"},{"prompt":"close-up","sceneId":"s2"}],"dependencies":[{"sceneId":"s2","dependsOn":["s1"]}]}'
```

> **Expected:** HTTP 200 BatchResult {results:{s1:..., s2:...}, totalTokens}. Per-item errors appear as {error} entries. Requires WISDOM_GATE_KEY + balance — NOT executed (credential/budget-gated).

### 9. Reuse a past generation as a reference

```bash
curl -s -X POST localhost:3002/api/gallery/<generationId>/use-as-reference
```

> **Expected:** HTTP 200 {generationId, data:<base64>, mimeType}. Feed `data` back into a new request's referenceImages[]. (Note: referenceImageIds[] in /api/generate resolves against the IMAGES table id, not the generation id.)

### 10. Raise the token ceiling

```bash
curl -s -X PUT localhost:3002/api/budget/ceiling -H 'content-type: application/json' -d '{"ceiling":250000}'
```

> **Expected:** HTTP 200 updated BudgetStatus. Rejects non-numbers / negatives with HTTP 400.

### Command Reference

| Command | Description |
|---------|-------------|
| `bun src/index.ts   (alias: just start)` | Run the HTTP server (port IMAGE_ENGINE_PORT, default 3002). |
| `bun --watch src/index.ts   (alias: just dev)` | Run the server with hot reload for development. |
| `bunx tsc --noEmit   (alias: just typecheck)` | Type-check the project. |
| `bunx @biomejs/biome check .   (alias: just lint)` | Lint and format check. |
| `bun test` | Run tests (test/inline-references.test.ts). |
| `GET /health` | Liveness check; returns 'ImageEngine API'. No key required. |
| `POST /api/generate` | Single generation. Body GenerationRequest {prompt(req), model?, aspectRatio?, imageSize?, forceImage?, systemInstruction?, conversationHistory?, referenceImages?, referenceImageIds?, sceneId?, openaiQuality?}. 201 result; 400 missing prompt; 402 budget exceeded; 404 reference image id not found; 413 reference image too large; 500 provider error. Behind rate limiter + budget guard. |
| `POST /api/generate/batch` | Batch generation. Body BatchRequest {items:GenerationRequest[], dependencies?:[{sceneId,dependsOn[]}]}. 200 BatchResult {results, totalTokens}; 400 empty items. Concurrency 5; per-item failures captured. |
| `GET /api/gallery?limit=&offset=` | Paginated list of generations (limit default 20, capped at 100; offset default 0). |
| `GET /api/gallery/:id` | Single generation record; 404 if missing. |
| `GET /api/gallery/:id/image` | Raw image bytes (Content-Type png/jpeg, Cache-Control 24h); 404 if record or file missing. |
| `POST /api/gallery/:id/use-as-reference` | Returns {generationId, data(base64), mimeType} to reuse as a reference image. |
| `GET /api/budget?wisgate=true` | Budget status (token + dollar). ?wisgate=true attaches live WisGate balance (best-effort). |
| `PUT /api/budget/ceiling` | Update token ceiling. Body {ceiling:number>=0}; 400 if invalid. |
| `GET /api/budget/history?from=&to=` | Token usage ledger, optional ISO date range. |
| `GET /api/budget/wisgate-balance` | Live WisGate account balance. |

---

## ⚙️ Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `WISDOM_GATE_KEY` | Yes | WisGate API key for both the Gemini (x-goog-api-key) and OpenAI-compatible (Bearer) endpoints. Read from .env (not process.env) on every call. No default — generation throws 'WISDOM_GATE_KEY missing in .env' without it. |
| `IMAGE_ENGINE_PORT` | No | HTTP server port. Default 3002. |
| `IMAGE_ENGINE_RATE_LIMIT` | No | Rate-limiter token-bucket capacity = requests per minute on /api/generate*. Default 10. |
| `IMAGE_ENGINE_TOKEN_CEILING` | No | Initial token budget ceiling seeded into budget_config on first run; enforced by the batch executor. Default 100000. Adjust later via PUT /api/budget/ceiling. |

---

## 💻 Development

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development mode |
| `bun run build` | Build for production |
| `bun test` | Run tests |
| `bun run lint` | Check code quality |

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | GET /api/gallery — paginated list of generations |
| `GET` | `/:id` | GET /api/gallery/:id — single generation details |
| `GET` | `/:id/image` | GET /api/gallery/:id/image — serve binary image |
| `POST` | `/:id/use-as-reference` | POST /api/gallery/:id/use-as-reference — return base64 for use as reference |
| `GET` | `/` | GET /api/budget — current budget status |
| `PUT` | `/ceiling` | PUT /api/budget/ceiling — update token ceiling |
| `GET` | `/history` | GET /api/budget/history — token usage history with optional date range |
| `GET` | `/wisgate-balance` | GET /api/budget/wisgate-balance — live WisGate balance |
| `POST` | `/` | POST /api/generate — single image generation |
| `POST` | `/batch` | POST /api/generate/batch — batch image generation |

---

## 📂 Project Structure

```
image-engine/
├── README.md
├── images
│   ├── hero.svg
│   └── pipeline.svg
├── justfile
├── knowledge
│   ├── acceptance-criteria.md
│   ├── dependencies.md
│   ├── domain.md
│   └── scope.md
├── package.json
├── src
│   ├── db.ts
│   ├── index.ts
│   ├── higgsfield-provider.ts
│   ├── lib
│   │   └── batch-executor.ts
│   ├── middleware
│   │   ├── budget-guard.ts
│   │   └── rate-limiter.ts
│   ├── openai-provider.ts
│   ├── routes
│   │   ├── budget.ts
│   │   ├── gallery.ts
│   │   └── generate.ts
│   ├── types.ts
│   └── wisgate.ts
├── test
│   ├── higgsfield-provider.test.ts
│   └── inline-references.test.ts
└── tsconfig.json
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and ensure tests pass
4. Commit your changes and open a pull request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with** 🧡 **using Bun, Hono, TypeScript**

</div>
