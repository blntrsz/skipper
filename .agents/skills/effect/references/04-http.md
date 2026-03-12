# HTTP

## Mental model

- HTTP is service-based, not a one-file framework.
- `HttpRouter` holds routes + middleware and produces an `HttpEffect`.
- Request-local data is installed into a `ServiceMap` before route handlers run.
- Generic HTTP contracts stay in `packages/effect`; runtime adapters live in platform packages.

Key files:

- `packages/effect/src/unstable/http/index.ts`
- `packages/effect/src/unstable/http/HttpRouter.ts`
- `packages/effect/src/unstable/http/HttpServer.ts`
- `packages/effect/src/unstable/http/HttpClient.ts`
- `packages/effect/src/unstable/http/HttpPlatform.ts`
- `packages/effect/src/unstable/http/FetchHttpClient.ts`
- `packages/effect/src/unstable/http/FindMyWay.ts`

## Important details

- `HttpRouter.asHttpEffect()` rebuilds request-local services from the current fiber services.
- Route lookup also handles `HEAD` via `GET` fallback.
- Route and middleware design assumes Effect-native error handling, interruption, and spans.
- `HttpPlatform` is the boundary for response/file/platform details.

## When changing behavior

- Check whether the change belongs in router, request parsing, server response, or platform adapter.
- Keep request-local service population consistent.
- If change is adapter-specific, inspect `packages/platform-bun/src/BunHttpServer.ts` or the matching platform file rather than polluting core abstractions.

Tests:

- `packages/effect/test/unstable/http/HttpClient.test.ts`
- `packages/effect/test/unstable/http/HttpEffect.test.ts`
- `packages/effect/test/unstable/http/HttpServerRequest.test.ts`
- `packages/effect/test/unstable/http/HttpServerResponse.test.ts`
