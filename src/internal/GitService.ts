import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { FuzzyFindService, FuzzyFindServiceImpl } from "@/internal/FuzzyFindService";
import { GitRepository, type GitRepositoryOption } from "@/domain/GitRepository";
import type { RepositoryPath } from "@/domain/RepositoryPath";
import type { WorkTreePath } from "@/domain/WorkTreePath";
import * as RepositoryPathModule from "@/domain/RepositoryPath";
import * as WorkTreePathModule from "@/domain/WorkTreePath";

export const GitService = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPath,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
  removeWorkTree: (
    repositoryPath: RepositoryPath,
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
  ) => Effect.Effect<string, never, never>;
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
  resolveGitRepository: (git: GitRepositoryOption) =>
    Effect.gen(function* () {
      const fuzzy = yield* FuzzyFindService;
      const fs = yield* FileSystem.FileSystem;
      const interactiveGitRepository =
        Option.isNone(git.repository) && Option.isNone(git.branch)
          ? yield* fuzzy.searchGitRepository()
          : null;

      if (
        Option.isNone(git.repository) &&
        Option.isNone(git.branch) &&
        interactiveGitRepository === null
      ) {
        return yield* Effect.fail(
          new UnknownError(undefined, "No repository/worktree selected")
        );
      }

      const repository = Option.isSome(git.repository)
        ? git.repository.value
        : interactiveGitRepository?.repository ??
          (yield* fuzzy.searchInDirectory(RepositoryPathModule.root(), {
            throwOnNotFound: true,
          }));
      const branch = Option.isSome(git.branch)
        ? git.branch.value
        : interactiveGitRepository?.branch ??
          (yield* Effect.gen(function* () {
            const workTreeRepositoryPath = WorkTreePathModule.makeRepositoryPath({
              repository,
              branch: "main",
            });

            const workTreeRepositoryExists = yield* fs.exists(
              workTreeRepositoryPath
            );

            if (!workTreeRepositoryExists) {
              return "main";
            }

            return yield* fuzzy.searchInDirectory(workTreeRepositoryPath, {
              additionalOptions: ["main"],
              throwOnNotFound: true,
            });
          }));

      return GitRepository.makeUnsafe({
        repository,
        branch,
      });
    }).pipe(Effect.provide(FuzzyFindServiceImpl)),
  resolveRepositoryName: (repository: Option.Option<string>) =>
    Effect.gen(function* () {
      if (Option.isSome(repository)) {
        return repository.value;
      }

      const fuzzy = yield* FuzzyFindService;
      return yield* fuzzy.searchInDirectory(RepositoryPathModule.root(), {
        throwOnNotFound: true,
      });
    }).pipe(Effect.provide(FuzzyFindServiceImpl)),
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
