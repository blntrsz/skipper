import { Path, Picker, SandboxService, SwitchService, listBranches } from "@skippercorp/core";
import { Effect, FileSystem } from "effect";
import { UnknownError } from "effect/Cause";
import { systemError } from "effect/PlatformError";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { join } from "node:path";

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
          systemError({
            _tag: "Unknown",
            module: "SandboxCli",
            method: "cloneCommand",
            description: `Failed to clone repository '${input.repository}'`,
            pathOrDescriptor: Path.repositoryRoot(),
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
  Effect.gen(function* () {
    const service = yield* SandboxService;

    yield* service.remove(
      { type: "tmux-worktree" },
      Path.GitRepositoryOption.makeUnsafe(config.git),
    );
  }),
).pipe(Command.withAlias("rm"), Command.withDescription("Remove sandbox resources"));

const switchCommand = Command.make(
  "switch",
  {
    repository: flags.git.repository,
    branch: flags.git.branch,
    create: Flag.boolean("create").pipe(Flag.withDescription("Create new branch and switch")),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* SwitchService;

      yield* service.run(input);
    }).pipe(
      Effect.catchIf(
        (error): error is Picker.PickerCancelled | Picker.PickerNoMatch =>
          error instanceof Picker.PickerCancelled || error instanceof Picker.PickerNoMatch,
        () => Effect.void,
      ),
    ),
).pipe(Command.withAlias("sw"), Command.withDescription("Pick repo and branch, then switch tmux"));

const promptForShellCommand = Prompt.run(
  Prompt.text({
    message: "Shell command",
    validate: (value) => {
      const command = value.trim();
      return command.length > 0 ? Effect.succeed(command) : Effect.fail("Command is required");
    },
  }),
).pipe(Effect.mapError(() => new Picker.PickerCancelled({})));

const listGitRepositories = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = Path.repositoryRoot();
    const entries = yield* fs.readDirectory(root).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(error),
      ),
      Effect.mapError((error) => new UnknownError(error, `Failed to list repositories in '${root}'`)),
    );

    const checks = yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function* () {
        const entryPath = join(root, entry);
        const stats = yield* fs.stat(entryPath).pipe(
          Effect.mapError((error) => new UnknownError(error, `Failed to inspect '${entryPath}'`)),
        );

        if (stats.type !== "Directory") {
          return null;
        }

        const hasGit = yield* fs.exists(join(entryPath, ".git")).pipe(
          Effect.mapError((error) => new UnknownError(error, `Failed to inspect '${entryPath}'`)),
        );

        return hasGit ? entry : null;
      }),
    );

    return checks
      .filter((entry): entry is string => entry !== null)
      .sort((left, right) => left.localeCompare(right));
  });

const runCommand = Command.make("run", {}, () =>
  Effect.gen(function* () {
    const picker = yield* Picker.PickerService;

    const repositories = yield* listGitRepositories();
    if (repositories.length === 0) {
      return yield* Effect.fail(
        new UnknownError(undefined, `No repositories found in '${Path.repositoryRoot()}'`),
      );
    }

    const repository = yield* picker.pick({ message: "Repository", options: repositories });
    const branches = yield* listBranches(repository);
    const branch = yield* picker.pick({ message: "Branch", options: [...branches] });
    const shellCommand = yield* promptForShellCommand;

    const targetPath = Path.resolveWorkspacePath({ repository, branch });
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(targetPath).pipe(
      Effect.mapError((error) => new UnknownError(error, `Failed to inspect '${targetPath}'`)),
    );

    if (!exists) {
      return yield* Effect.fail(
        new UnknownError(undefined, `Target path '${targetPath}' not found for '${repository}:${branch}'`),
      );
    }

    const result = yield* Effect.tryPromise({
      try: async () =>
        Bun.$`${{ raw: shellCommand }}`
          .cwd(targetPath)
          .env(process.env)
          .nothrow(),
      catch: (error) => new UnknownError(error, `Failed to execute command in '${targetPath}'`),
    });

    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new UnknownError(undefined, result.stderr.toString().trim() || "Shell command failed"),
      );
    }
  }).pipe(
    Effect.catchIf(
      (error): error is Picker.PickerCancelled | Picker.PickerNoMatch =>
        error instanceof Picker.PickerCancelled || error instanceof Picker.PickerNoMatch,
      () => Effect.void,
    ),
  ),
).pipe(Command.withDescription("Pick repo and branch, then run a shell command in that worktree"));

export const sandboxCommand = Command.make("sandbox").pipe(
  Command.withAlias("s"),
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([addCommand, removeCommand, switchCommand, runCommand]),
);
