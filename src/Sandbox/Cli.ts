import { Effect, FileSystem } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";
import { SandboxService } from "./Port";
import { SandboxConfig } from "../domain/Sandbox";
import { GitRepositoryOption } from "../domain/GitRepository";
import { SandboxServiceImpl } from "./Service";
import * as RepositoryPath from "../domain/RepositoryPath";

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
        Flag.withDescription(
          "Git repository name (uses interactive picker when omitted)"
        )
      )
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(
        Flag.withAlias("branchname"),
        Flag.withDescription(
          "Git branch (uses interactive picker when omitted)"
        )
      )
    ),
  },
};

export const cloneCommand = Command.make(
  "clone",
  {
    repository: Argument.string("repository").pipe(
      Argument.withDescription("GitHub repository (owner/repo or URL)")
    ),
  },
  (input) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        yield* fs.makeDirectory(RepositoryPath.root(), { recursive: true });

        const handle = yield* ChildProcess.make({
          cwd: RepositoryPath.root(),
        })`gh repo clone ${input.repository}`;

        yield* handle.exitCode;
      })
    )
).pipe(Command.withAlias("c"), Command.withDescription("Clone repository into local repository root"));

export const addCommand = Command.make("add", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.create(
      SandboxConfig.makeUnsafe(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(Command.withDescription("Create worktree"));

export const pickerCommand = Command.make("picker", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.picker(
      SandboxConfig.makeUnsafe(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(
  Command.withAlias("p"),
  Command.withDescription("Open interactive repository/worktree picker")
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
