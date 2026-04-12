---
system: "image-engine"
type: dependencies
version: 1
lastUpdated: "2026-04-12"
lastUpdatedBy: build-mode
---

# Dependencies — ImageEngine

## Runtime Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| hono | ^4.0.0 | HTTP server framework |

## Build Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| @biomejs/biome | ^1.9.0 | Linting and formatting |
| @types/bun | latest | Bun type definitions |
| typescript | ^5.7.0 | TypeScript compiler |

## External Services

| Service | Purpose | Failure Impact |
|---------|---------|---------------|
| WisGate API (api.wisgate.ai) | Image generation via Gemini models | All generation fails; gallery still accessible |
| WisGate Balance API | Account balance monitoring | Budget tracking degrades to local-only |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| WISDOM_GATE_KEY | (required) | WisGate API authentication |
| IMAGE_ENGINE_PORT | 3002 | HTTP server port |
| IMAGE_ENGINE_TOKEN_CEILING | 100000 | Budget ceiling in tokens |
| IMAGE_ENGINE_RATE_LIMIT | 10 | Max requests per minute |
