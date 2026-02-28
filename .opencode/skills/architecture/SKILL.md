---
name: architecture
description: Design and implement maintainable, end-to-end type-safe Bun/TypeScript code with clear module boundaries, small composable functions, and mandatory function-level JSDoc. Use for new features, refactors, and code reviews.
compatibility: opencode, bun, typescript
metadata:
  audience: agents-and-humans
  version: "1.0.0"
---

# Architecture Skill

## When to use

Use this skill when work includes any of:

- New feature implementation
- Refactor of existing code
- Cross-file changes touching behavior and structure
- Type-safety hardening
- Code quality or maintainability review

## Core principles

1. Build from lego bricks: small pure functions -> orchestrator functions -> command entrypoints.
2. Keep boundaries explicit:
   - `app/`: wiring and registration
   - `command/` or `commands/`: orchestration
   - `shared/`: generic helpers and validators
   - adapters/integration code isolated from pure logic
3. Enforce end-to-end type safety at every external boundary.
4. Prefer readability over cleverness.
5. Preserve behavior while refactoring unless user asked for behavior change.

## Function design rules

- One function = one clear responsibility.
- Target <= 40 LOC for regular functions.
- Keep high-level orchestrators thin; mostly call helpers.
- Prefer typed object params when args > 4.
- Split parse/validate/transform/effect steps.

## Mandatory JSDoc format

Every production function must include JSDoc in this exact shape:

```ts
/**
 * Short description sentence.
 *
 * @since <semver>
 * @category <category>
 */
```

Optional tags for non-trivial code:

- `@param`
- `@returns`
- `@throws`
- `@example`

## Category taxonomy

Use one of:

- `CLI`
- `Worktree`
- `AWS.Deploy`
- `AWS.Template`
- `AWS.CloudFormation`
- `AWS.GitHub`
- `AWS.Lambda`
- `Shared`
- `Infra`

## Type-safety checklist

At ingress points (CLI args, env vars, JSON payloads, API responses):

1. Parse unknown input.
2. Validate shape with type guards/schemas.
3. Convert to typed domain object.
4. Pass typed data inward.

Rules:

- No unchecked `JSON.parse(...) as T`.
- No new `any`.
- Avoid non-null assertions unless strictly proven.
- Exported functions should have explicit return types.

## Refactor workflow

1. Freeze behavior with/using tests.
2. Extract pure helpers first.
3. Move side effects behind small adapter functions.
4. Replace unsafe casts with validated parsing.
5. Add/normalize JSDoc for every production function touched.
6. Re-run typecheck + tests.

## Done criteria

Change is done only when all are true:

- Module boundaries are clearer than before.
- Functions are short and composable.
- All touched production functions have required JSDoc.
- External data flow is validated and typed.
- `bun x tsc --noEmit` passes.
- `bun test` passes.

## Anti-patterns to avoid

- Giant command handlers mixing parse, business logic, I/O, and output.
- Hidden coupling via global mutable state.
- Broad utility files with unrelated helpers.
- Silent fallback behavior that masks invalid input.
- Refactors that also change behavior without explicit intent.
