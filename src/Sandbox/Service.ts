import { Effect, Match, pipe, ServiceMap } from "effect";
import { SandboxService } from "./Port";
import type { SandboxConfig } from "../domain/Sandbox";
import * as TmuxSandbox from "./adapter/TmuxSandboxService";
import * as WorkTreeSandbox from "./adapter/WorkTreeService";
import { GitService, GitServiceImpl } from "../internal/GitService";
import * as DockerSandbox from "./adapter/DockerSandboxService";
import {
  SandboxDefinitionService,
  SandboxDefinitionServiceImpl,
} from "../internal/SandboxDefinitionService";

const notImplemented = (
  action: "create" | "remove" | "picker",
  type: SandboxConfig["type"]
) =>
  Effect.gen(function* () {
    yield* Effect.logError("Sandbox backend not implemented");
    yield* Effect.die(`Sandbox backend '${type}'.'${action}' not implemented`);
  });

/**
 * Creates a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
const create: SandboxService["create"] = (config, git) =>
  Effect.gen(function* () {
    const gitService = yield* GitService;
    const gitRepository = yield* gitService.resolveGitRepository(git);
    const sandboxDefinitionService = yield* SandboxDefinitionService;

    const matcher = pipe(
      Match.type<SandboxConfig>(),
      Match.discriminator("type")("tmux-worktree", () =>
        WorkTreeSandbox.create(gitRepository)
      ),
      Match.discriminator("type")("tmux-main", () =>
        notImplemented("create", "tmux-main")
      ),
      Match.discriminator("type")("docker", (dockerConfig) =>
        Effect.gen(function* () {
          yield* WorkTreeSandbox.create(gitRepository);

          const definition = yield* sandboxDefinitionService.resolveDockerSandboxDefinition(
            gitRepository.repository,
            dockerConfig.sandbox
          );

          yield* DockerSandbox.create(gitRepository, definition);
        })
      ),
      Match.discriminator("type")("ecs", () => notImplemented("create", "ecs")),
      Match.exhaustive
    );

    yield* matcher(config);

    yield* Effect.logInfo(config.type === "docker" ? "Docker sandbox ready" : "Worktree ready");
  }).pipe(Effect.provide(GitServiceImpl), Effect.provide(SandboxDefinitionServiceImpl));

/**
 * Picks and attaches to a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
const picker: SandboxService["picker"] = (config, git) =>
  Effect.gen(function* () {
    const gitService = yield* GitService;
    const gitRepository = yield* gitService.resolveGitRepository(git);
    const sandboxDefinitionService = yield* SandboxDefinitionService;

    const matcher = pipe(
      Match.type<SandboxConfig>(),
      Match.discriminator("type")("tmux-worktree", () =>
        Effect.gen(function* () {
          yield* WorkTreeSandbox.create(gitRepository);
          yield* TmuxSandbox.attach(gitRepository);
        })
      ),
      Match.discriminator("type")("tmux-main", () =>
        notImplemented("picker", "tmux-main")
      ),
      Match.discriminator("type")("docker", (dockerConfig) =>
        Effect.gen(function* () {
          yield* WorkTreeSandbox.create(gitRepository);

          const definition = yield* sandboxDefinitionService.resolveDockerSandboxDefinition(
            gitRepository.repository,
            dockerConfig.sandbox
          );

          yield* DockerSandbox.create(gitRepository, definition);
        })
      ),
      Match.discriminator("type")("ecs", () => notImplemented("picker", "ecs")),
      Match.exhaustive
    );

    yield* matcher(config);
  }).pipe(Effect.provide(GitServiceImpl), Effect.provide(SandboxDefinitionServiceImpl));

/**
 * Removes a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
const remove: SandboxService["remove"] = (config, git) =>
  Effect.gen(function* () {
    const gitService = yield* GitService;
    const gitRepository = yield* gitService.resolveGitRepository(git);
    const sandboxDefinitionService = yield* SandboxDefinitionService;

    const matcher = pipe(
      Match.type<SandboxConfig>(),
      Match.discriminator("type")("tmux-worktree", () =>
        WorkTreeSandbox.remove(gitRepository)
      ),
      Match.discriminator("type")("tmux-main", () =>
        notImplemented("remove", "tmux-main")
      ),
      Match.discriminator("type")("docker", (dockerConfig) =>
        Effect.gen(function* () {
          const definition = yield* sandboxDefinitionService.resolveDockerSandboxDefinition(
            gitRepository.repository,
            dockerConfig.sandbox
          );

          yield* DockerSandbox.remove(gitRepository, definition);
        })
      ),
      Match.discriminator("type")("ecs", () => notImplemented("remove", "ecs")),
      Match.exhaustive
    );

    yield* matcher(config);

    yield* Effect.logInfo(config.type === "docker" ? "Docker sandbox removed" : "Workflow removed");
  }).pipe(Effect.provide(GitServiceImpl), Effect.provide(SandboxDefinitionServiceImpl));

/**
 * Implementation of SandboxService that delegates to specific sandbox implementations based on the provided configuration.
 *
 * @since 1.0.0
 * @category Service
 */
export const SandboxServiceImpl = ServiceMap.make(SandboxService, {
  create,
  picker,
  remove,
});
