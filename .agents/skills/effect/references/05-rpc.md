# RPC

## Mental model

- An `Rpc` describes one endpoint: payload schema, success schema, error schema, middleware, and extra requirements.
- `RpcGroup` collects procedures.
- `RpcServer` and `RpcClient` are the transport bridge.
- `RpcTest.makeClient` gives an in-memory loopback client/server for fast tests.

Key files:

- `packages/effect/src/unstable/rpc/index.ts`
- `packages/effect/src/unstable/rpc/Rpc.ts`
- `packages/effect/src/unstable/rpc/RpcGroup.ts`
- `packages/effect/src/unstable/rpc/RpcMiddleware.ts`
- `packages/effect/src/unstable/rpc/RpcClient.ts`
- `packages/effect/src/unstable/rpc/RpcServer.ts`
- `packages/effect/src/unstable/rpc/RpcTest.ts`
- `packages/effect/src/unstable/rpc/RpcSchema.ts`

## Important details

- RPC is schema-heavy and type-level intense; preserve payload/success/error/defect separation.
- Middleware can add services and requirements, so a small type change can ripple widely.
- Look for `toHandlers`, `toLayer`, or client/server factory helpers before adding custom glue.
- Use `RpcTest.makeClient` when you need behavior tests without a real transport.

## Edit checklist

- If schema shape changes, verify both encoding and decoding sides.
- If middleware changes, inspect service requirements and client/server middleware symmetry.
- If transport behavior changes, check test helpers too.
