import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { SandboxService } from "./Port";
import { SandboxConfig } from "../domain/Sandbox";
import { GitRepositoryOption } from "../domain/GitRepository";
import { SandboxServiceImpl } from "./Service";

const flags = {
  type: Flag.choice("type", [
    "tmux-worktree",
    "tmux-main",
    "docker",
    "ecs",
  ]).pipe(
    Flag.withDefault("tmux-worktree"),
    Flag.withDescription("Sandbox backend type")
  ),
  git: {
    repository: Flag.optional(
      Flag.string("repository").pipe(
        Flag.withAlias("username"),
        Flag.withDescription("Git repository name (uses fzf when omitted)")
      )
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(
        Flag.withAlias("branchname"),
        Flag.withDescription("Git branch (uses fzf when omitted)")
      )
    ),
  },
};

export const createCommand = Command.make("create", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.create(
      SandboxConfig.makeUnsafe(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(
  Command.withAlias("a"),
  Command.withDescription("Create sandbox resources")
);

export const removeCommand = Command.make("remove", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.remove(
      SandboxConfig.makeUnsafe(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove sandbox resources")
);
