import { Path, Picker, Sandbox, SandboxService, SwitchService } from "@skippercorp/core";
import { Effect, FileSystem } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

const flags = {
  git: {
    repository: Flag.optional(
      Flag.string("repository").pipe(
        Flag.withAlias("username"),
        Flag.withDescription("Git repository name"),
      ),
    ),
    branch: Flag.optional(
      Flag.string("branch").pipe(Flag.withAlias("branchname"), Flag.withDescription("Git branch")),
    ),
  },
};

const ensureCommandInstalled = (command: string, installMessage: string) =>
  Effect.tryPromise({
    try: async () => {
      const result = await Bun.$`${{ raw: `command -v ${command} >/dev/null 2>&1` }}`
        .env(process.env)
        .nothrow();

      if (result.exitCode !== 0) {
        throw new Error(installMessage);
      }
    },
    catch: (cause) =>
      new Sandbox.SandboxError({
        message: installMessage,
        cause,
      }),
  });

const catchPickerExit = <A, E, R>(
  effect: Effect.Effect<A, E | Picker.PickerCancelled | Picker.PickerNoMatch, R>,
) =>
  effect.pipe(
    Effect.catchTag("PickerCancelled", () => Effect.void),
    Effect.catchTag("PickerNoMatch", () => Effect.void),
  );

export const cloneCommand = Command.make(
  "clone",
  {
    repository: Argument.string("repository").pipe(
      Argument.withDescription("GitHub repository (owner/repo or URL)"),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      yield* fs.makeDirectory(Path.repositoryRoot(), { recursive: true });
      yield* ensureCommandInstalled(
        "gh",
        "gh is required for clone. Install GitHub CLI and retry.",
      );

      yield* Effect.tryPromise({
        try: async () => {
          const result = await Bun.$`${["gh", "repo", "clone", input.repository]}`
            .cwd(Path.repositoryRoot())
            .env(process.env)
            .nothrow();

          if (result.exitCode !== 0) {
            throw new Error(result.stderr.toString().trim() || "gh repo clone failed");
          }
        },
        catch: (cause) =>
          new Sandbox.SandboxError({
            message: `Failed to clone repository '${input.repository}'`,
            cause,
          }),
      });
    }),
).pipe(
  Command.withAlias("c"),
  Command.withDescription("Clone repository into local repository root"),
);

export const addCommand = Command.make("add", flags, (config) =>
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.create(
      { type: "tmux-worktree" },
      Path.GitRepositoryOption.makeUnsafe(config.git),
    );
  }),
).pipe(Command.withDescription("Create sandbox resources"));

export const removeCommand = Command.make("remove", flags, (config) =>
  catchPickerExit(
    Effect.gen(function* () {
      const service = yield* SandboxService;

      yield* service.remove(
        { type: "tmux-worktree" },
        Path.GitRepositoryOption.makeUnsafe(config.git),
      );
    }),
  ),
).pipe(Command.withAlias("rm"), Command.withDescription("Remove sandbox resources"));

const switchCommand = Command.make(
  "switch",
  {
    repository: flags.git.repository,
    branch: flags.git.branch,
    create: Flag.boolean("create").pipe(Flag.withDescription("Create new branch and switch")),
  },
  (input) =>
    catchPickerExit(
      Effect.gen(function* () {
        const service = yield* SwitchService;

        yield* service.run(input);
      }),
    ),
).pipe(Command.withAlias("sw"), Command.withDescription("Pick repo and branch, then switch tmux"));

export const sandboxCommand = Command.make("sandbox").pipe(
  Command.withAlias("s"),
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([addCommand, removeCommand, switchCommand]),
);
