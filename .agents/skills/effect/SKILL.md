---
name: effect
description: Work in the Effect monorepo with repo-native patterns. Use whenever the user asks to edit, debug, explain, refactor, or test code in `packages/effect`, `packages/vitest`, or `packages/platform-bun`, or mentions `Effect.gen`, `Effect.fn`, `ServiceMap`, `Layer`, runtime/dependency injection, `Config`, `Schema`, `Model`, unstable CLI/HTTP/RPC, SQL schema helpers, Bun runtime, or Effect testing. Especially use this skill when a change needs the right env/layer/schema/testing conventions; read the matching reference before editing.
compatibility:
  tools:
    - read
    - grep
    - glob
    - bash
    - apply_patch
---

# Effect

Use local Effect idioms, not generic TypeScript patterns.

## Start

- If task is broad or unfamiliar, read `references/00-read-first.md`.
- Then read only the relevant area:
  - DI/runtime/env -> `references/01-core-di-runtime.md`
  - Config/Schema -> `references/02-config-schema.md`
  - CLI -> `references/03-cli.md`
  - HTTP -> `references/04-http.md`
  - RPC -> `references/05-rpc.md`
  - Model/SQL -> `references/06-model-sql.md`
  - Vitest/Bun -> `references/07-testing-bun.md`
- Use `references/08-file-index.md` for a fast file map.

## Default workflow

1. Open the public module the user mentioned first.
2. Open the nearest tests, dtslint file, or semantics/doc file that locks behavior.
3. Trace into internal helpers only as needed.
4. Preserve existing style: doc-heavy exports, explicit types, `dual` overloads, `Effect.fn` / `Effect.fnUntraced`, `ServiceMap`, `Layer`, schema-driven boundaries.
5. Make the smallest change that matches nearby code.
6. Keep docs/examples/tests in sync when public behavior changes.

## Repo heuristics

- `Runtime.ts` is mostly edge-runner / exit-code glue. Dependency injection usually means `ServiceMap`, `Effect.provide*`, `Layer`, `ManagedRuntime`.
- `ServiceMap.Reference` default values are cached on the key object. Missing refs are not recomputed per access.
- `Config.withDefault` and `Config.option` recover only missing-data failures, not bad values.
- `Schema.optional` and `Schema.optionalKey` mean different things. Do not swap them casually.
- CLI parsing semantics are intentionally documented in `packages/effect/src/unstable/cli/SEMANTICS.md`. If semantics change, update doc + locking tests together.
- SQL schema contracts are type-locked in `packages/effect/dtslint/unstable/sql/SqlSchema.tst.ts`.
- Some barrels are auto-generated. If a file says so, do not hand-edit it unless the repo's normal generation flow requires it.

## Preferred patterns

- Reach for `Effect.gen` when sequencing effectful logic improves clarity.
- Use `Effect.fnUntraced` for small reusable helpers unless you need traced spans or post-processing; use `Effect.fn(name)` when naming/tracing matters.
- Model dependencies with `ServiceMap.Service` / `Reference`, satisfy them with `Layer` or `Effect.provideService*`.
- Keep config and external I/O schema-driven when the surrounding code already does that.
- For unstable CLI/HTTP/RPC, follow the local abstractions instead of introducing ad hoc parsers, routers, or RPC glue.

## When editing

- If you touch public API docs, keep `@since`, `@category`, examples, and wording style coherent with neighboring exports.
- If you change a type-level contract, look for a dtslint or test file before finishing.
- If you change runtime wiring, verify both service requirements and provision sites.
- If you change a parsing rule, check whether docs, tests, and suggestion behavior all need updates.

## Response shape

- Explain the chosen Effect idiom briefly.
- Mention key files changed and any gotcha that drove the design.
- Suggest the next obvious verification step only if useful.
