import { Effect, Layer } from "effect";
import { SandboxService } from "./SandboxService";
import * as WorkTreeSandbox from "./adapter/WorkTreeService";
import { Git } from "@/internal";

/**
 * Creates a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
export const TmuxWorkTreeSandboxService = Layer.effect(
  SandboxService,
  Effect.gen(function* () {
    const gitService = yield* Git.GitService;

    const create: SandboxService["create"] = (_config, git) =>
      Effect.gen(function* () {
        const gitRepository = yield* gitService.resolveGitRepository(git);

        yield* WorkTreeSandbox.create(gitRepository).pipe(
          Effect.provideService(Git.GitService, gitService)
        );

        yield* Effect.logInfo("Worktree ready");
      });

    const remove: SandboxService["remove"] = (config, git) =>
      Effect.gen(function* () {
        const gitRepository = yield* gitService.resolveGitRepository(git);

        yield* WorkTreeSandbox.remove(gitRepository).pipe(
          Effect.provideService(Git.GitService, gitService)
        );

        yield* Effect.logInfo(
          `Sandbox removed for ${gitRepository.repository} (${config.type})`
        );
      });

    return { create, remove } satisfies SandboxService;
  })
);
