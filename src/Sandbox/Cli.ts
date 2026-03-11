import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { SandboxService } from "./Port";
import type { SandboxConfig } from "../domain/Sandbox";
import { GitRepositoryOption } from "../domain/GitRepository";
import { SandboxServiceImpl } from "./Service";
import * as RepositoryPath from "../domain/RepositoryPath";
import type { Option } from "effect";
import { systemError } from "effect/PlatformError";
import { SwitchService } from "@/internal/SwitchService";
import { PickerCancelled, PickerNoMatch } from "@/internal/Picker/Service";
import { TerminalPicker } from "@/internal/Picker/TerminalService";
import { GitServiceImpl } from "@/internal/GitService";
import { SandboxDefinitionServiceImpl } from "@/internal/SandboxDefinitionService";
import { SwitchServiceImpl } from "@/internal/SwitchService";
import { TmuxServiceImpl } from "@/internal/Tmux";

type SandboxCommandConfig = {
  readonly type: "tmux-worktree" | "docker";
  readonly sandbox: Option.Option<string>;
};

const toSandboxConfig = (config: SandboxCommandConfig): SandboxConfig => {
  switch (config.type) {
    case "docker":
      return {
        type: "docker",
        sandbox: config.sandbox,
      };
    case "tmux-worktree":
    default:
      return { type: "tmux-worktree" };
  }
};

const sandboxLayer = SandboxServiceImpl.pipe(
  Layer.provide(
    Layer.succeedServices(
      ServiceMap.mergeAll(GitServiceImpl, SandboxDefinitionServiceImpl)
    )
  )
);

const switchLayer = SwitchServiceImpl.pipe(
  Layer.provide(Layer.succeedServices(ServiceMap.mergeAll(TmuxServiceImpl, TerminalPicker, GitServiceImpl)))
);

const flags = {
  type: Flag.choice("type", ["tmux-worktree", "docker"]).pipe(
    Flag.withDefault("tmux-worktree"),
    Flag.withDescription("Sandbox backend type")
  ),
  sandbox: Flag.optional(
    Flag.string("sandbox").pipe(Flag.withDescription("Sandbox name"))
  ),
  git: {
    repository: Flag.optional(
      Flag.string("repository").pipe(
        Flag.withAlias("username"),
        Flag.withDescription("Git repository name")
      )
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(
        Flag.withAlias("branchname"),
        Flag.withDescription("Git branch")
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
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      yield* fs.makeDirectory(RepositoryPath.root(), { recursive: true });

      yield* Effect.tryPromise({
        try: async () => {
          const result = await Bun.$`${[
            "gh",
            "repo",
            "clone",
            input.repository,
          ]}`
            .cwd(RepositoryPath.root())
            .env(process.env)
            .nothrow();

          if (result.exitCode !== 0) {
            throw new Error(
              result.stderr.toString().trim() || "gh repo clone failed"
            );
          }
        },
        catch: (cause) =>
          systemError({
            _tag: "Unknown",
            module: "SandboxCli",
            method: "cloneCommand",
            description: `Failed to clone repository '${input.repository}'`,
            pathOrDescriptor: RepositoryPath.root(),
            cause,
          }),
      });
    })
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
  }).pipe(Effect.provide(sandboxLayer))
).pipe(Command.withDescription("Create sandbox resources"));

export const removeCommand = Command.make("remove", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.remove(
      toSandboxConfig(config),
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(sandboxLayer))
).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove sandbox resources")
);

export const switchCommand = Command.make(
  "switch",
  {
    repository: flags.git.repository,
    branch: flags.git.branch,
    create: Flag.boolean("create").pipe(
      Flag.withDescription("Create new branch and switch")
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SwitchService;

      yield* service.run(input);
    }).pipe(
      Effect.catchIf(
        (error): error is PickerCancelled | PickerNoMatch =>
          error instanceof PickerCancelled || error instanceof PickerNoMatch,
        () => Effect.void
      ),
      Effect.provide(switchLayer)
    )
).pipe(
  Command.withAlias("sw"),
  Command.withDescription("Pick repo and branch, then switch tmux")
);

export const sandboxCommand = Command.make("sandbox").pipe(
  Command.withAlias("s"),
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([addCommand, removeCommand])
);
