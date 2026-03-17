import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import { Prompt } from "effect/unstable/cli";
import * as Path from "../domain/Path";
import { PickerCancelled } from "../internal/Picker/PickerService";
import * as Shell from "../internal/Shell";
import { ensureInteractive, hasTerminal, resolveGitTarget } from "./GitTargetResolver";
import { RunService } from "./RunService";

const pathExists = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path);
  });

const promptForCommand = Prompt.run(
  Prompt.text({
    message: "Command",
    validate: (value) => {
      const command = value.trim();
      return command.length > 0 ? Effect.succeed(command) : Effect.fail("Command is required");
    },
  }),
).pipe(Effect.mapError(() => new PickerCancelled({})));

const resolveCommand = (command: Option.Option<string>) =>
  Option.isSome(command)
    ? Effect.sync(() => command.value.trim()).pipe(
        Effect.flatMap((value) =>
          value.length > 0
            ? Effect.succeed(value)
            : Effect.fail(new UnknownError(undefined, "Command is required")),
        ),
      )
    : ensureInteractive(
        "sandbox run requires a TTY when --repository, --branch, or --command is missing",
        promptForCommand,
      );

const run: RunService["run"] = (input) =>
  Effect.gen(function* () {
    if (
      !hasTerminal() &&
      (!Option.isSome(input.repository) ||
        !Option.isSome(input.branch) ||
        !Option.isSome(input.command))
    ) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          "sandbox run requires a TTY when --repository, --branch, or --command is missing",
        ),
      );
    }

    const gitTarget = yield* resolveGitTarget(
      Path.GitRepositoryOption.makeUnsafe({
        repository: input.repository,
        branch: input.branch,
      }),
      {
        missingMessage: "sandbox run requires a TTY when --repository or --branch is missing",
      },
    );
    const command = yield* resolveCommand(input.command);
    const cwd = Path.resolveWorkspacePath(gitTarget);
    const exists = yield* pathExists(cwd).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(
            error,
            `Failed to resolve path for '${gitTarget.repository}:${gitTarget.branch}'`,
          ),
      ),
    );

    if (!exists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          gitTarget.branch === "main"
            ? `Repository path '${cwd}' not found for '${gitTarget.repository}:main'`
            : `Sandbox worktree not found for '${gitTarget.repository}:${gitTarget.branch}' at '${cwd}'`,
        ),
      );
    }

    const shell = yield* Shell.ShellService;
    return yield* shell.run({ command, cwd });
  });

export const TerminalRunService = ServiceMap.make(RunService, { run });
