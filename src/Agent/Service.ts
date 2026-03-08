import { Effect, FileSystem, ServiceMap } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { UnknownError } from "effect/Cause";
import * as RepositoryPath from "../domain/RepositoryPath";
import { AgentService } from "./Port";
import {
  AgentCommandService,
  AgentCommandServiceImpl,
} from "../internal/AgentCommandService";
import { GitService, GitServiceImpl } from "../internal/GitService";

const splitCommand = (command: string): ReadonlyArray<string> =>
  command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

const run: AgentService["run"] = (input) =>
  Effect.scoped(
    Effect.gen(function* () {
      const agentCommand = yield* AgentCommandService;
      const git = yield* GitService;
      const fs = yield* FileSystem.FileSystem;
      const prompt = input.prompt.trim();

      if (prompt.length === 0) {
        return yield* Effect.fail(
          new UnknownError(undefined, "Prompt must not be empty")
        );
      }

      const repository = yield* git.resolveRepositoryName(input.repository);
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
  ).pipe(
    Effect.provide(GitServiceImpl),
    Effect.provide(AgentCommandServiceImpl)
  );

export const AgentServiceImpl = ServiceMap.make(AgentService, {
  run,
});
