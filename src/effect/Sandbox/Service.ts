import { Effect, Match, pipe, ServiceMap } from "effect";
import { SandboxService } from "./Port";
import type { SandboxConfig } from "../domain/Sandbox";
import * as TmuxWorktreeSandbox from "./adapter/TmuxWorkTreeService";

const notImplemented = (
  action: "create" | "remove",
  type: SandboxConfig["type"]
) =>
  Effect.gen(function* () {
    yield* Effect.logError("Sandbox backend not implemented");
    yield* Effect.die(`Sandbox backend '${type}'.'${action}' not implemented`);
  });

export const SandboxServiceImpl = ServiceMap.make(SandboxService, {
  create: (config) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Dispatch sandbox create");

      const matcher = pipe(
        Match.type<SandboxConfig>(),
        Match.discriminator("type")(
          "tmux-worktree",
          TmuxWorktreeSandbox.create
        ),
        Match.discriminator("type")("tmux-main", () =>
          notImplemented("create", "tmux-main")
        ),
        Match.discriminator("type")("docker", () =>
          notImplemented("create", "docker")
        ),
        Match.discriminator("type")("ecs", () =>
          notImplemented("create", "ecs")
        ),
        Match.exhaustive
      );

      yield* matcher(config);

      yield* Effect.logInfo("Sandbox create finished");
    }),
  remove: (config) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Dispatch sandbox remove");

      const matcher = pipe(
        Match.type<SandboxConfig>(),
        Match.discriminator("type")(
          "tmux-worktree",
          TmuxWorktreeSandbox.remove
        ),
        Match.discriminator("type")("tmux-main", () =>
          notImplemented("remove", "tmux-main")
        ),
        Match.discriminator("type")("docker", () =>
          notImplemented("remove", "docker")
        ),
        Match.discriminator("type")("ecs", () =>
          notImplemented("remove", "ecs")
        ),
        Match.exhaustive
      );

      yield* matcher(config);

      yield* Effect.logInfo("Sandbox remove finished");
    }),
});
