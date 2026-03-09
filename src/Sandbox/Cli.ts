import { Effect, FileSystem } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";
import { SandboxService } from "./Port";
import type { SandboxConfig } from "../domain/Sandbox";
import { GitRepositoryOption } from "../domain/GitRepository";
import { SandboxServiceImpl } from "./Service";
import * as RepositoryPath from "../domain/RepositoryPath";
import type { Option } from "effect";
import { SwitchService, SwitchServiceImpl } from "@/internal/SwitchService";
import { PickerCancelled } from "@/internal/InteractivePicker";

type SandboxCommandConfig = {
  readonly type: "tmux-worktree" | "tmux-main" | "docker" | "ecs";
  readonly sandbox: Option.Option<string>;
};

const toSandboxConfig = (config: SandboxCommandConfig): SandboxConfig => {
  switch (config.type) {
    case "docker":
      return {
        type: "docker",
        sandbox: config.sandbox,
      };
    case "tmux-main":
      return { type: "tmux-main" };
    case "ecs":
      return { type: "ecs" };
    case "tmux-worktree":
    default:
      return { type: "tmux-worktree" };
  }
};

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
  sandbox: Flag.optional(
    Flag.string("sandbox").pipe(
      Flag.withDescription("Sandbox name (uses interactive picker when omitted)")
    )
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
).pipe(
  Command.withAlias("c"),
  Command.withDescription("Clone repository into local repository root")
);

export const addCommand = Command.make("add", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.create(
      toSandboxConfig(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(Command.withDescription("Create sandbox resources"));

export const pickerCommand = Command.make("picker", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.picker(
      toSandboxConfig(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(
  Command.withAlias("p"),
  Command.withDescription("Open interactive sandbox picker")
);

export const removeCommand = Command.make("remove", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.remove(
      toSandboxConfig(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(SandboxServiceImpl))
).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove sandbox resources")
);

export const switchCommand = Command.make(
  "switch",
  {
    repository: flags.git.repository,
    branch: flags.git.branch,
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SwitchService;

      yield* service.run(input);
    }).pipe(
      Effect.catchIf(
        (error): error is PickerCancelled => error instanceof PickerCancelled,
        () => Effect.void
      ),
      Effect.provide(SwitchServiceImpl)
    )
).pipe(
  Command.withAlias("sw"),
  Command.withDescription("Pick repo and branch, then switch tmux")
);

export const sandboxCommand = Command.make("sandbox").pipe(
  Command.withAlias("s"),
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([addCommand, pickerCommand, removeCommand])
);
