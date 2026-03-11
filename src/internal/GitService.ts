import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import { type PlatformError, systemError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
  GitRepository,
  type GitRepositoryOption,
} from "@/domain/GitRepository";
import * as RepositoryPath from "@/domain/RepositoryPath";
import type { RepositoryPath as RepositoryPathType } from "@/domain/RepositoryPath";
import type { WorkTreePath } from "@/domain/WorkTreePath";

export const GitService = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
    git: GitRepository
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
  ) => Effect.Effect<
    string,
    PlatformError | UnknownError,
    FileSystem.FileSystem
  >;
}>("GitService");

export const GitServiceImpl = ServiceMap.make(GitService, {
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
    git: GitRepository
  ) =>
    Effect.tryPromise({
      try: async () => {
        const result = await Bun.$`${[
          "git",
          "worktree",
          "add",
          workTreePath,
          "-b",
          git.branch,
        ]}`
          .cwd(repositoryPath)
          .env(process.env)
          .nothrow();

        if (result.exitCode !== 0) {
          throw new Error(
            result.stderr.toString().trim() || "git worktree add failed"
          );
        }
      },
      catch: (cause) =>
        systemError({
          _tag: "Unknown",
          module: "GitService",
          method: "createWorkTree",
          description: `Failed to create worktree '${workTreePath}'`,
          pathOrDescriptor: repositoryPath,
          cause,
        }),
    }),
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
    Effect.tryPromise({
      try: async () => {
        const result = await Bun.$`${[
          "git",
          "worktree",
          "remove",
          workTreePath,
        ]}`
          .cwd(repositoryPath)
          .env(process.env)
          .nothrow();

        if (result.exitCode !== 0) {
          throw new Error(
            result.stderr.toString().trim() || "git worktree remove failed"
          );
        }
      },
      catch: (cause) =>
        systemError({
          _tag: "Unknown",
          module: "GitService",
          method: "removeWorkTree",
          description: `Failed to remove worktree '${workTreePath}'`,
          pathOrDescriptor: repositoryPath,
          cause,
        }),
    }),
});
