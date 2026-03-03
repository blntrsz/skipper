import { Effect, Scope, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { RepositoryPath } from "@/effect/domain/RepositoryPath";
import type { WorkTreePath } from "@/effect/domain/WorkTreePath";

export const GitService = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner | Scope.Scope>;
  removeWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner | Scope.Scope>;
}>("GitService");

export const GitServiceImpl = ServiceMap.make(GitService, {
  createWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Running git command");

      yield* Effect.logInfo(
        `Creating git Worktree in ${repositoryPath} and ${workTreePath}`
      );

      const handle = yield* ChildProcess.make({
        cwd: repositoryPath,
      })`git worktree add ${workTreePath}`;

      yield* handle.exitCode;
    }),
  removeWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Running git command");

      const handle = yield* ChildProcess.make({
        cwd: repositoryPath,
      })`git worktree remove ${workTreePath}`;

      yield* handle.exitCode;
    }),
});
