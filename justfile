dev:
    bun --watch src/index.ts

start:
    bun src/index.ts

typecheck:
    bunx tsc --noEmit

lint:
    bunx @biomejs/biome check .
