# Config + Schema

## Config

- `Config<T>` is both a parser recipe and a yieldable effect.
- `Config.schema(codec, path?)` is the high-leverage constructor.
- Structured config usually means `Config.schema`, `Config.all`, `Config.unwrap`, `Config.nested`.
- Ambient lookup uses the current `ConfigProvider` service; explicit `.parse(provider)` bypasses that.

Gotchas:

- `withDefault` and `option` only recover missing-data errors.
- `orElse` catches all `ConfigError`s.
- `Config.schema` decodes a provider-produced `StringTree`; path handling matters for nice error pointers.

Key files:

- `packages/effect/src/Config.ts`
- `packages/effect/src/ConfigProvider.ts`
- `packages/effect/test/Config.test.ts`
- `packages/effect/test/ConfigProvider.test.ts`

## ConfigProvider

- `fromEnv` joins path segments with `_` and also discovers children by splitting env keys on `_`.
- With camelCase schema keys, `ConfigProvider.constantCase` is often the right adapter.
- `nested` and `mapInput` composition order matters.

## Schema

- `Schema` is the type/runtime boundary.
- A codec tracks decoded `Type`, encoded `Encoded`, plus decoding/encoding service requirements.
- Prefer explicit decode/encode direction: `decodeUnknownEffect`, `decodeUnknownSync`, `encodeEffect`, etc.
- Public schema APIs often rely on explicit transformations via `decodeTo` / `encodeTo`.

Gotchas:

- `optional` means exact optional key plus `undefined`; `optionalKey` means missing key only.
- `decodeUnknownSync` throws; use `Exit`, `Option`, or `Effect` variants when throwing is not desired.
- Filters do not narrow TS types by themselves; look for `brand` / `refine` style APIs.

Key files:

- `packages/effect/src/Schema.ts`
- `packages/effect/src/SchemaTransformation.ts`
- `packages/effect/src/SchemaAST.ts`

## Model

- `unstable/schema/Model.ts` builds multiple schema views from one domain model.
- Core idea: one field can differ across `select`, `insert`, `update`, `json`, `jsonCreate`, `jsonUpdate`.
- Read `VariantSchema.ts` if a `Model` change feels magical.

Key files:

- `packages/effect/src/unstable/schema/Model.ts`
- `packages/effect/src/unstable/schema/VariantSchema.ts`
