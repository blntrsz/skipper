import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { GitRepository, type GitRepositoryOption } from "../../domain/GitRepository";
import type { RepositoryPath as RepositoryPathType, WorkTreePath } from "../../domain/Path";
import * as Path from "../../domain/Path";
import * as Shell from "../Shell";
import { GitError, GitService } from "./GitService";

export const ShellGitService = ServiceMap.make(GitService, {
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
    git: GitRepository,
  ) =>
    Effect.gen(function* () {
      const { $ } = yield* Shell.ShellService;
      yield* $({
        command: `cd ${repositoryPath} && git worktree add ${workTreePath} -b ${git.branch}`,
        errorMessage: `Failed to create worktree '${workTreePath}'`,
      });
    }),
  resolveGitRepository: (git: GitRepositoryOption) =>
    Effect.gen(function* () {
      if (Option.isNone(git.repository)) {
        return yield* Effect.fail(new GitError({ message: "Missing --repository <name>" }));
      }

      if (Option.isNone(git.branch)) {
        return yield* Effect.fail(new GitError({ message: "Missing --branch <name>" }));
      }

      return GitRepository.makeUnsafe({
        repository: git.repository.value,
        branch: git.branch.value,
      });
    }),
  resolveRepositoryName: (repository: Option.Option<string>) =>
    Effect.gen(function* () {
      if (Option.isNone(repository)) {
        return yield* Effect.fail(new GitError({ message: "Missing --repository <name>" }));
      }

      return repository.value;
    }),
  ensureRepositoryExists: (repository: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repositoryPath = Path.makeRepositoryPath(repository);

      const exists = yield* fs.exists(repositoryPath).pipe(
        Effect.mapError(
          (cause) =>
            new GitError({
              message: `Failed to check repository '${repository}'`,
              cause,
            }),
        ),
      );

      if (exists) {
        return repository;
      }

      return yield* Effect.fail(
        new GitError({
          message: `Repository '${repository}' not found in '${Path.repositoryRoot()}'`,
        }),
      );
    }),
  removeWorkTree: (repositoryPath: RepositoryPathType, workTreePath: WorkTreePath) =>
    Effect.gen(function* () {
      const { $ } = yield* Shell.ShellService;
      yield* $({
        command: `cd ${repositoryPath} && git worktree remove ${workTreePath}`,
        errorMessage: `Failed to remove worktree '${workTreePath}'`,
      });
    }),
});
