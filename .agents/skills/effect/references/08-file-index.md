# File Index

Use this when you want the shortest path to the right file.

## Core

- `packages/effect/src/Effect.ts` - core constructors, combinators, `gen`, `fn`, provide/service helpers
- `packages/effect/src/ServiceMap.ts` - service keys, references, service maps
- `packages/effect/src/Layer.ts` - layer construction/composition
- `packages/effect/src/ManagedRuntime.ts` - cached runtime built from a layer
- `packages/effect/src/Runtime.ts` - run-main, exit codes, error-reporting flags

## Config / Schema

- `packages/effect/src/Config.ts` - schema-driven config API
- `packages/effect/src/ConfigProvider.ts` - env/object/file providers
- `packages/effect/src/Schema.ts` - main schema surface
- `packages/effect/src/SchemaTransformation.ts` - decode/encode transforms
- `packages/effect/src/unstable/schema/Model.ts` - multi-variant domain models
- `packages/effect/src/unstable/schema/VariantSchema.ts` - `Model` machinery

## CLI

- `packages/effect/src/unstable/cli/Command.ts` - commands, subcommands, shared flags
- `packages/effect/src/unstable/cli/Flag.ts` - flags
- `packages/effect/src/unstable/cli/Param.ts` - param model
- `packages/effect/src/unstable/cli/SEMANTICS.md` - intended parser behavior
- `packages/effect/test/unstable/cli/Command.test.ts` - main locking tests

## HTTP / RPC / SQL

- `packages/effect/src/unstable/http/HttpRouter.ts` - routing + request-local service map setup
- `packages/effect/src/unstable/http/HttpServer.ts` - server contract
- `packages/effect/src/unstable/http/HttpClient.ts` - client contract
- `packages/effect/src/unstable/rpc/Rpc.ts` - RPC definition model
- `packages/effect/src/unstable/rpc/RpcTest.ts` - in-memory client/server testing helper
- `packages/effect/src/unstable/sql/SqlSchema.ts` - schema-driven SQL helpers
- `packages/effect/dtslint/unstable/sql/SqlSchema.tst.ts` - SQL type contract lock

## Testing / Bun

- `packages/vitest/src/index.ts` - public testing API
- `packages/vitest/src/internal/internal.ts` - test runtime internals
- `packages/platform-bun/src/BunRuntime.ts` - Bun main runner
- `packages/platform-bun/src/BunServices.ts` - Bun service bundle
- `packages/platform-bun/src/BunHttpServer.ts` - Bun HTTP adapter
