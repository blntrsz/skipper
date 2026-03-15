import { Effect, ServiceMap } from "effect";
import { Git } from "../internal";
import * as WorkTreeSandbox from "./adapter/WorkTreeService";
import { SandboxService } from "./SandboxService";

/**
 * Creates a sandbox environment based on the provided configuration and Git repository information.
 * Delegates to specific sandbox implementations (e.g., tmux-worktree) based on the 'type' field in the configuration.
 *
 * @since 1.0.0
 * @category ServiceMethod
 */
const create: SandboxService["create"] = (_config, git) =>
  Effect.gen(function* () {
    const gitService = yield* Git.GitService;
    const gitRepository = yield* gitService.resolveGitRepository(git);

    yield* WorkTreeSandbox.create(gitRepository);
    yield* Effect.logInfo("Worktree ready");
  });

const remove: SandboxService["remove"] = (config, git) =>
  Effect.gen(function* () {
    const gitService = yield* Git.GitService;
    const gitRepository = yield* gitService.resolveGitRepository(git);

    yield* WorkTreeSandbox.remove(gitRepository);
    yield* Effect.logInfo(`Sandbox removed for ${gitRepository.repository} (${config.type})`);
  });

export const TmuxWorkTreeSandboxService = ServiceMap.make(SandboxService, {
  create,
  remove,
});
