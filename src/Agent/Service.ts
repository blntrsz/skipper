import { Effect, FileSystem, Option, PlatformError, ServiceMap } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { createInterface } from "node:readline/promises";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { UnknownError } from "effect/Cause";
import * as RepositoryPath from "../domain/RepositoryPath";
import {
  FuzzyFindService,
  FuzzyFindServiceImpl,
} from "../internal/FuzzyFindService";
import {
  GLOBAL_CONFIG_PATH,
  GlobalConfigService,
  GlobalConfigServiceImpl,
} from "../internal/GlobalConfigService";

type AgentRunInput = {
  readonly prompt: string;
  readonly repository: Option.Option<string>;
};

const commandPrompt = "Command missing. Enter command: ";

const isInteractive = () =>
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.env.CI === undefined;

const splitCommand = (command: string): ReadonlyArray<string> =>
  command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

const resolveRepositoryName = (repository: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isSome(repository)) {
      return repository.value;
    }

    const fuzzy = yield* FuzzyFindService;
    return yield* fuzzy.searchInDirectory(RepositoryPath.root(), {
      throwOnNotFound: true,
    });
  });

const promptForCommand = Effect.promise(async () => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(commandPrompt);
    return answer.trim();
  } finally {
    rl.close();
  }
});

const resolveCommand = Effect.gen(function* () {
  const globalConfig = yield* GlobalConfigService;
  const command = yield* globalConfig.getCommand();

  if (typeof command === "string" && command.trim().length > 0) {
    return command.trim();
  }

  if (!isInteractive()) {
    return yield* Effect.fail(
      new UnknownError(
        undefined,
        `Missing command in ${GLOBAL_CONFIG_PATH}. Add { "command": "opencode run" }`
      )
    );
  }

  const prompted = yield* promptForCommand;

  if (prompted.length === 0) {
    return yield* Effect.fail(
      new UnknownError(undefined, "Command must not be empty")
    );
  }

  yield* globalConfig.setCommand(prompted);
  return prompted;
});

export const AgentService = ServiceMap.Service<{
  run: (
    input: AgentRunInput
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
}>("AgentService");

export const AgentServiceImpl = ServiceMap.make(AgentService, {
  run: (input) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const prompt = input.prompt.trim();

        if (prompt.length === 0) {
          return yield* Effect.fail(
            new UnknownError(undefined, "Prompt must not be empty")
          );
        }

        const repository = yield* resolveRepositoryName(input.repository);
        const repositoryPath = RepositoryPath.make(repository);
        const repositoryExists = yield* fs.exists(repositoryPath);

        if (!repositoryExists) {
          return yield* Effect.fail(
            new UnknownError(
              undefined,
              `Repository '${repository}' not found in '${RepositoryPath.root()}'`
            )
          );
        }

        const command = yield* resolveCommand;
        const parts = splitCommand(command);
        const executable = parts[0];

        if (executable === undefined) {
          return yield* Effect.fail(
            new UnknownError(undefined, "Command must not be empty")
          );
        }

        const handle = yield* ChildProcess.make(
          executable,
          [...parts.slice(1), prompt],
          {
            cwd: repositoryPath,
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          }
        );

        yield* handle.exitCode;
      })
    ).pipe(
      Effect.provide(FuzzyFindServiceImpl),
      Effect.provide(GlobalConfigServiceImpl)
    ),
});
