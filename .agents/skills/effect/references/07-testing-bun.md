# Testing + Bun

## `@effect/vitest`

- Main entrypoints are `effect`, `live`, and `layer` from `@effect/vitest`.
- `it.effect` / `effect(...)` run with test services like `TestClock`.
- `it.live` / `live(...)` run against the live Effect environment.
- `layer(...)` shares a built `Layer` across tests and handles cleanup.
- Property tests can use schema-derived arbitraries.

Key files:

- `packages/vitest/README.md`
- `packages/vitest/src/index.ts`
- `packages/vitest/src/internal/internal.ts`
- `packages/vitest/test/index.test.ts`

## Testing cues

- Prefer Effect-native assertions/setup when the code under test needs services or time.
- If a test depends on ambient services, `layer(...)` is usually cleaner than repeated manual provision.
- If time matters, check whether the test should run under `TestClock` or `live`.

## Bun

- `platform-bun` provides Bun-specific adapters around shared platform abstractions.
- `BunRuntime.runMain` is the Bun edge-runner.
- `BunServices.layer` bundles file system, path, stdio, terminal, child process services.
- `BunHttpServer` is the main place where Bun request handling is translated into Effect HTTP abstractions.

Key files:

- `packages/platform-bun/src/index.ts`
- `packages/platform-bun/src/BunRuntime.ts`
- `packages/platform-bun/src/BunServices.ts`
- `packages/platform-bun/src/BunHttpServer.ts`
- `packages/platform-bun/src/BunHttpPlatform.ts`

## Edit checklist

- Keep core HTTP abstractions generic; push Bun specifics into `platform-bun`.
- If you touch Bun server/runtime behavior, inspect cleanup, abort, and service-layer wiring.
