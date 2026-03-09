import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { UnknownError } from "effect/Cause";
import { AgentService } from "./Port";
import { AgentCommandService } from "../internal/AgentCommandService";
import * as RepositoryPath from "../domain/RepositoryPath";
import { GitService } from "../internal/GitService";

const splitCommand = (command: string): ReadonlyArray<string> =>
  command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

export const AgentServiceImpl = Layer.effect(
  AgentService,
  Effect.gen(function* () {
    const agentCommand = yield* AgentCommandService;
    const git = yield* GitService;

    const run: AgentService["run"] = (input) =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const prompt = input.prompt.trim();

          if (prompt.length === 0) {
            return yield* Effect.fail(
              new UnknownError(undefined, "Prompt must not be empty")
            );
          }

          const repository = yield* git.resolveRepositoryName(input.repository);
          yield* git.ensureRepositoryExists(repository);
          const repositoryPath = RepositoryPath.make(repository);

          const command = yield* agentCommand.resolveCommand();
          const parts = splitCommand(command);
          const executable = parts[0];

          if (executable === undefined) {
            return yield* Effect.fail(
              new UnknownError(undefined, "Command must not be empty")
            );
          }

          const handle = yield* ChildProcess.make(executable, [...parts.slice(1), prompt], {
            cwd: repositoryPath,
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          });

          yield* handle.exitCode;
        })
      );

    return { run } satisfies AgentService;
  })
);
