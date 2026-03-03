import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import type { SandboxConfig } from "../domain/Sandbox";
import { SandboxService } from "./Port";
import { SandboxServiceImpl } from "./Service";

const sandboxTypeChoices = [
  "tmux-worktree",
  "tmux-main",
  "docker",
  "ecs",
] as const;

const sandboxConfigFlags = {
  type: Flag.choice("type", sandboxTypeChoices).pipe(
    Flag.withDefault("tmux-worktree"),
    Flag.withDescription("Sandbox backend type")
  ),
  git: {
    repository: Flag.string("repository").pipe(
      Flag.withDescription("Git repository name")
    ),
    branch: Flag.string("branch").pipe(Flag.withDescription("Git branch")),
  },
} as const;

const toSandboxConfig = (config: {
  readonly type: SandboxConfig["type"];
  readonly git: {
    readonly repository: string;
    readonly branch: string;
  };
}): SandboxConfig => ({
  type: config.type,
  git: {
    repository: config.git.repository,
    branch: config.git.branch,
  },
});

const createCommand = Command.make("create", sandboxConfigFlags, (config) =>
  Effect.gen(function* () {
    const sandboxConfig = toSandboxConfig(config);

    yield* Effect.logInfo("Sandbox create requested");

    const sandbox = yield* SandboxService;

    yield* Effect.scoped(
      sandbox.create(sandboxConfig).pipe(
        Effect.withLogSpan("sandbox.create"),
        Effect.tap(() => Effect.logInfo("Sandbox create completed")),
        Effect.tapError((error) =>
          Effect.logError("Sandbox create failed", error)
        )
      )
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(Command.withDescription("Create sandbox resources"));

const removeCommand = Command.make("remove", sandboxConfigFlags, (config) =>
  Effect.gen(function* () {
    const sandboxConfig = toSandboxConfig(config);

    yield* Effect.logInfo("Sandbox remove requested");

    const sandbox = yield* SandboxService;

    yield* Effect.scoped(
      sandbox.remove(sandboxConfig).pipe(
        Effect.withLogSpan("sandbox.remove"),
        Effect.tap(() => Effect.logInfo("Sandbox remove completed")),
        Effect.tapError((error) =>
          Effect.logError("Sandbox remove failed", error)
        )
      )
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(Command.withDescription("Remove sandbox resources"));

export const SandboxCli = Command.make("sandbox").pipe(
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([createCommand, removeCommand])
);
