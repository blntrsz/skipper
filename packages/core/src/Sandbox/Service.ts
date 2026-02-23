import { Effect, ServiceMap } from "effect";

export class SandboxService extends ServiceMap.Service()("SandboxService", {
  make: Effect.gen(function* () {
    function make() {}

    return { make };
  }),
}) {}
