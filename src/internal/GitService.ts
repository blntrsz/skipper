import { Effect, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { RepositoryPath } from "@/domain/RepositoryPath";
import type { WorkTreePath } from "@/domain/WorkTreePath";

export const GitService = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
  removeWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
}>("GitService");

export const GitServiceImpl = ServiceMap.make(GitService, {
  createWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* ChildProcess.make({
          cwd: repositoryPath,
        })`git worktree add ${workTreePath}`;

        yield* handle.exitCode;
      })
    ),
  removeWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* ChildProcess.make({
          cwd: repositoryPath,
        })`git worktree remove ${workTreePath}`;

        yield* handle.exitCode;
      })
    ),
});
