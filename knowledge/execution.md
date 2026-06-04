---
system: "image-engine"
type: execution
driver: cli
entry: "bun src/index.ts  # starts the HTTP gateway (default port 3002); then POST /api/generate | POST /api/generate/batch | GET|PUT /api/budget"
mode: orchestrate
gates: executor
version: 1
lastUpdated: "2026-06-04"
lastUpdatedBy: build-mode
---

# Execution — ImageEngine

How Execute Mode (`/adcelerate-execute`) runs this system. Execute Mode reads ONLY this manifest to decide how to run, then branches on `driver`.

## Invocation
ImageEngine is an HTTP gateway (Hono). Start the service, then call its endpoints. Requires `WISDOM_GATE_KEY`; honors `IMAGE_ENGINE_PORT` (default 3002), `IMAGE_ENGINE_TOKEN_CEILING`, `IMAGE_ENGINE_RATE_LIMIT`.

```
bun src/index.ts                 # start the gateway (GET /health → "ImageEngine API")
POST /api/generate               # generation stage
POST /api/generate/batch         # batch-execution stage
GET /api/budget | PUT /api/budget/ceiling   # budget-management stage
```

## Natural flow (awareness only — the system drives this on the skill path)
1. **generation** — `POST /api/generate` with `{ prompt, model?, referenceImages?, aspectRatio?, imageSize? }`; returns the generated image metadata + token usage via the WisGate API.
2. **batch-execution** — `POST /api/generate/batch` with `{ items[], dependencies? }`; topologically sorts items and runs them in concurrent layers, returning results keyed by `sceneId`.
3. **budget-management** — `GET /api/budget` reports spend/ceiling; `PUT /api/budget/ceiling` updates the token ceiling; budget is enforced (402 when WisGate balance is exhausted).

## Where the agent must check / supply input
- **generation** — supply the **prompt** (required) and optionally **model**, **reference images / ids**, **aspect ratio**, **image size**.
- **batch-execution** — supply the **items array** and any **dependency** specs between scenes.
- **budget-management** — supplying a new **token ceiling** via `PUT /api/budget/ceiling` requires engineer approval; otherwise the budget is read-only. Confirm the **budget ceiling** before large/batch runs.

## Validation
After execution, validate the output against [acceptance-criteria.md](acceptance-criteria.md) (hard gates inline, soft criteria via the validator). Applies to both drivers.
