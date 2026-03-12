# Model + SQL

## Model

- `unstable/schema/Model.ts` derives multiple variants from one schema definition.
- Common variants: `select`, `insert`, `update`, `json`, `jsonCreate`, `jsonUpdate`.
- Field helpers like `Generated`, `Sensitive`, `FieldOption`, and date/time helpers encode domain conventions.

Key files:

- `packages/effect/src/unstable/schema/Model.ts`
- `packages/effect/src/unstable/schema/VariantSchema.ts`

## What to watch

- A field change can affect several variants at once.
- If behavior looks surprising, inspect how `VariantSchema.make(...)` derives variant views.
- JSON-facing and DB-facing schemas intentionally diverge in many helpers.

## SQL helpers

- `SqlSchema` keeps request and result boundaries schema-driven.
- Request input is typed as decoded `Type`, encoded before execution, then DB output is decoded against the result schema.
- That contract is locked both at runtime and type level.

Key files:

- `packages/effect/src/unstable/sql/SqlSchema.ts`
- `packages/effect/src/unstable/sql/SqlModel.ts`
- `packages/effect/test/unstable/sql/SqlSchema.test.ts`
- `packages/effect/dtslint/unstable/sql/SqlSchema.tst.ts`

## Edit checklist

- If you touch SQL helper signatures, inspect dtslint before finishing.
- If you touch model helpers, think through every variant, not only the default `select` view.
