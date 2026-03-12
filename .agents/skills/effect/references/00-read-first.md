# Read First

## Mental model

- `Effect<A, E, R>` = success `A`, failure `E`, requirements `R`.
- Requirements are usually `ServiceMap` keys, satisfied by `Effect.provide*`, `Layer`, or `ManagedRuntime`.
- `Schema` tracks decoded type, encoded form, and service requirements for decoding/encoding.
- `Config` is a schema-driven recipe over a `ConfigProvider` tree and is also yieldable in `Effect.gen`.

## First files to open

- `packages/effect/src/Effect.ts`
- `packages/effect/src/ServiceMap.ts`
- `packages/effect/src/Layer.ts`
- `packages/effect/src/ManagedRuntime.ts`
- `packages/effect/src/Config.ts`
- `packages/effect/src/Schema.ts`

## Read order by task

- New effect workflow or helper -> `Effect.ts`, then nearby tests in `packages/effect/test/Effect*.ts`
- DI/runtime issue -> `ServiceMap.ts`, `Layer.ts`, `ManagedRuntime.ts`, then `Runtime.ts`
- Config loading bug -> `Config.ts`, `ConfigProvider.ts`, then `packages/effect/test/Config*.ts`
- Schema/modeling task -> `Schema.ts`, `SchemaTransformation.ts`, `unstable/schema/Model.ts`
- CLI change -> `unstable/cli/Command.ts`, `SEMANTICS.md`, then `packages/effect/test/unstable/cli/*.test.ts`
- HTTP/RPC change -> router/client/server module first, then test or adapter files

## Repo style cues

- Public modules are docs-first and example-heavy.
- Many APIs support data-first + data-last via `dual`.
- Effect helpers often use `Effect.fnUntraced` internally and `Effect.fn(name)` where tracing names matter.
- Service wiring prefers `Layer` and service keys over manual object plumbing.

## Helpful extras beyond the user list

- `packages/effect/src/ConfigProvider.ts` - needed for most real config work
- `packages/effect/src/ManagedRuntime.ts` - real runtime provisioning story
- `packages/effect/src/Layer.ts` - main composition surface for services
- `packages/effect/src/unstable/schema/VariantSchema.ts` - explains `Model`
- `packages/effect/src/unstable/sql/SqlSchema.ts` - runtime half of SQL dtslint contract
