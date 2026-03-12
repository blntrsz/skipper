# Core DI + Runtime

## ServiceMap

- Define service keys with `ServiceMap.Service(...)`.
- Define defaultable ambient values with `ServiceMap.Reference(...)`.
- Access services by yielding the key, calling `asEffect()`, or using `Effect.service*` helpers.
- Missing-service errors use the key stack captured at creation time.
- `Reference` defaults are cached on the key object; they are not recomputed each access.

Key files:

- `packages/effect/src/ServiceMap.ts`
- `packages/effect/src/Effect.ts`

## Effect ergonomics

- `Effect.gen` is the normal sequential style.
- `Effect.fnUntraced` wraps reusable effectful functions with low tracing overhead.
- `Effect.fn(name)` adds traced spans/frames and supports post-processing of the returned effect.
- Common DI helpers live in `Effect.ts`: `serviceOption`, `provideServices`, `provideService`, `provideServiceEffect`.

## Layer

- `Layer<ROut, E, RIn>` describes how to build services from dependencies.
- Layers are the repo-native way to compose services and resources.
- Reuse nearby constructors like `Layer.succeed`, `Layer.effect`, `Layer.mergeAll`, `Layer.provideMerge` before inventing new wiring.
- If a service allocates resources, inspect scope/finalizer behavior before changing construction.

Key files:

- `packages/effect/src/Layer.ts`
- `packages/effect/test/Layer.test.ts`

## ManagedRuntime vs Runtime

- `ManagedRuntime.make(layer)` is the app-facing runtime for cached service construction + `run*` helpers.
- `Runtime.ts` is mostly process-edge behavior: `makeRunMain`, exit codes, error reporting markers.
- If the user says "runtime with DI", they probably need `Layer` + `ManagedRuntime`, not `Runtime.ts` alone.

Key files:

- `packages/effect/src/ManagedRuntime.ts`
- `packages/effect/src/Runtime.ts`
- `packages/effect/test/ManagedRuntime.test.ts`

## Edit checklist

- If you add a requirement, check every provision site.
- If you change a layer output, check memoization / scope behavior.
- If you touch `runMain` behavior, think about interrupts, exit codes, and error reporting.
