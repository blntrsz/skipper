import { Effect, Layer, ServiceMap } from "effect";
import { AgentService } from "./Port";
import { AgentCommandService } from "../internal/AgentCommandService";
import * as RepositoryPath from "../domain/RepositoryPath";
import { GitService } from "../internal/GitService";
import { captureAgentCommand, runAgentCommand } from "@/internal/AgentRunner";
import { AgentServiceError } from "./Error";

export const AgentServiceImpl = Layer.effect(
  AgentService,
  Effect.gen(function* () {
    const agentCommand = yield* AgentCommandService;
    const git = yield* GitService;

    const run: AgentService["run"] = (input) =>
      Effect.scoped(
        Effect.gen(function* () {
          const prompt = input.prompt.trim();

          if (prompt.length === 0) {
            return yield* Effect.fail(
              new AgentServiceError({ message: "Prompt must not be empty" })
            );
          }

          const repository = yield* git.resolveRepositoryName(input.repository);
          yield* git.ensureRepositoryExists(repository);
          const repositoryPath = RepositoryPath.make(repository);

          const command = yield* agentCommand.resolveCommand();
          yield* runAgentCommand(command, repositoryPath, prompt);
        })
      );

    const prompt: AgentService["prompt"] = (input) =>
      Effect.scoped(
        Effect.gen(function* () {
          const prompt = input.prompt.trim();

          if (prompt.length === 0) {
            return yield* Effect.fail(
              new AgentServiceError({ message: "Prompt must not be empty" })
            );
          }

          const repository = yield* git.resolveRepositoryName(input.repository);
          yield* git.ensureRepositoryExists(repository);
          const repositoryPath = RepositoryPath.make(repository);
          const command = yield* agentCommand.resolveCommand();
          const result = yield* captureAgentCommand(command, repositoryPath, prompt);

          return result.stdout;
        })
      );

    return { run, prompt } satisfies AgentService;
  })
);
