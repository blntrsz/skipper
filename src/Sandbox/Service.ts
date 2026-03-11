import { Effect, Layer } from "effect";
import { SandboxService } from "./Port";
import * as WorkTreeSandbox from "./adapter/WorkTreeService";
import { GitService } from "../internal/GitService";
import * as DockerSandbox from "./adapter/DockerSandboxService";
import { SandboxDefinitionService } from "../internal/SandboxDefinitionService";

/**
 * Creates a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
export const SandboxServiceImpl = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const gitService = yield* GitService;
    const sandboxDefinitionService = yield* SandboxDefinitionService;

    const create: SandboxService["create"] = (config, git) =>
      Effect.gen(function* () {
        const gitRepository = yield* gitService.resolveGitRepository(git);

        switch (config.type) {
          case "tmux-worktree":
            yield* WorkTreeSandbox.create(gitRepository).pipe(
              Effect.provideService(GitService, gitService)
            );
            break;
          case "docker": {
            yield* WorkTreeSandbox.create(gitRepository).pipe(
              Effect.provideService(GitService, gitService)
            );

            const definition =
              yield* sandboxDefinitionService.resolveDockerSandboxDefinition(
                gitRepository.repository,
                config.sandbox
              );

            yield* DockerSandbox.create(gitRepository, definition);
            break;
          }
        }

        yield* Effect.logInfo(
          config.type === "docker" ? "Docker sandbox ready" : "Worktree ready"
        );
      });

    const remove: SandboxService["remove"] = (config, git) =>
      Effect.gen(function* () {
        const gitRepository = yield* gitService.resolveGitRepository(git);

        switch (config.type) {
          case "tmux-worktree":
            yield* WorkTreeSandbox.remove(gitRepository).pipe(
              Effect.provideService(GitService, gitService)
            );
            break;
          case "docker": {
            const definition =
              yield* sandboxDefinitionService.resolveDockerSandboxDefinition(
                gitRepository.repository,
                config.sandbox
              );

            yield* DockerSandbox.remove(gitRepository, definition);
            break;
          }
        }

        yield* Effect.logInfo(
          `Sandbox removed for ${gitRepository.repository} (${config.type})`
        );
      });

    return { create, remove } satisfies SandboxService;
  })
);
