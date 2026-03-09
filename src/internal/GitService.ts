import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { GitRepository, type GitRepositoryOption } from "@/domain/GitRepository";
import * as RepositoryPath from "@/domain/RepositoryPath";
import type { RepositoryPath as RepositoryPathType } from "@/domain/RepositoryPath";
import type { WorkTreePath } from "@/domain/WorkTreePath";

export const GitService = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
  removeWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
  resolveGitRepository: (
    git: GitRepositoryOption
  ) => Effect.Effect<
    GitRepository,
    PlatformError | UnknownError,
    FileSystem.FileSystem
  >;
  resolveRepositoryName: (
    repository: Option.Option<string>
  ) => Effect.Effect<string, UnknownError, never>;
  ensureRepositoryExists: (
    repository: string
  ) => Effect.Effect<string, PlatformError | UnknownError, FileSystem.FileSystem>;
}>("GitService");

export const GitServiceImpl = ServiceMap.make(GitService, {
  createWorkTree: (
    repositoryPath: RepositoryPathType,
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
  resolveGitRepository: (git: GitRepositoryOption) =>
    Effect.gen(function* () {
      if (Option.isNone(git.repository)) {
        return yield* Effect.fail(
          new UnknownError(undefined, "Missing --repository <name>")
        );
      }

      if (Option.isNone(git.branch)) {
        return yield* Effect.fail(
          new UnknownError(undefined, "Missing --branch <name>")
        );
      }

      return GitRepository.makeUnsafe({
        repository: git.repository.value,
        branch: git.branch.value,
      });
    }),
  resolveRepositoryName: (repository: Option.Option<string>) =>
    Effect.gen(function* () {
      if (Option.isNone(repository)) {
        return yield* Effect.fail(
          new UnknownError(undefined, "Missing --repository <name>")
        );
      }

      return repository.value;
    }),
  ensureRepositoryExists: (repository: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repositoryPath = RepositoryPath.make(repository);

      if (yield* fs.exists(repositoryPath)) {
        return repository;
      }

      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${RepositoryPath.root()}'`
        )
      );
    }),
  removeWorkTree: (
    repositoryPath: RepositoryPathType,
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
