import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { SandboxService } from "./SandboxService";
import { GitRepositoryOption } from "../domain/GitRepository";
import { TmuxWorkTreeSandboxService } from "./TmuxWorkTreeSandboxService";
import * as RepositoryPath from "../domain/RepositoryPath";
import { systemError } from "effect/PlatformError";
import { SwitchService } from "./SwitchService";
import { TmuxSwitchService } from "./TmuxSwitchService";
import { PickerCancelled, PickerNoMatch } from "@/internal/Picker/PickerService";
import { TerminalPickerService } from "@/internal/Picker/TerminalPickerService";
import { Git } from "@/internal";
import { ShellTmuxService } from "@/internal/Tmux";

const sandboxLayer = TmuxWorkTreeSandboxService.pipe(
  Layer.provide(Layer.succeedServices(ServiceMap.mergeAll(Git.ShellGitService)))
);

const switchLayer = TmuxSwitchService.pipe(
  Layer.provide(
    Layer.succeedServices(
      ServiceMap.mergeAll(
        ShellTmuxService,
        TerminalPickerService,
        Git.ShellGitService
      )
    )
  )
);

const flags = {
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
      { type: "tmux-worktree" },
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(sandboxLayer))
).pipe(Command.withDescription("Create sandbox resources"));

export const removeCommand = Command.make("remove", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.remove(
      { type: "tmux-worktree" },
      GitRepositoryOption.makeUnsafe(config.git)
    );
  }).pipe(Effect.provide(sandboxLayer))
).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove sandbox resources")
);

const switchCommand = Command.make(
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
  Command.withSubcommands([addCommand, removeCommand, switchCommand])
);
