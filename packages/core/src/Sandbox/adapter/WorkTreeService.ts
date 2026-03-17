import { join } from "node:path";
import { Effect, FileSystem } from "effect";
import * as Path from "../../domain/Path";
import { GitRepository } from "../../domain/Path";
import { Git } from "../../internal";

export const create = (config: GitRepository) =>
  Effect.gen(function* () {
    if (config.branch === "main") {
      yield* Effect.logInfo("Skipped worktree create for main branch");
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const git = yield* Git.GitService;
    const repositoryPath = Path.makeRepositoryPath(config.repository);
    const workTreeRepositoryPath = Path.makeWorkTreeRepositoryPath(config);
    const gitRepository = GitRepository.makeUnsafe({
      repository: config.repository,
      branch: config.branch,
    });
    const workTreePath = Path.makeWorkTreePath(config);
    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (isWorkTreeExists) {
      return;
    }

    yield* fs.makeDirectory(workTreeRepositoryPath, { recursive: true });
    yield* git.createWorkTree(repositoryPath, workTreePath, gitRepository);
  });

export const remove = (config: GitRepository) =>
  Effect.gen(function* () {
    if (config.branch === "main") {
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const git = yield* Git.GitService;
    const repositoryPath = Path.makeRepositoryPath(config.repository);
    const workTreeRepositoryPath = Path.makeWorkTreeRepositoryPath(config);
    const workTreePath = Path.makeWorkTreePath(config);
    const legacyWorkTreePath = Path.WorkTreePath.makeUnsafe(
      join(workTreeRepositoryPath, config.branch),
    );
    const isWorkTreeExists = yield* fs.exists(workTreePath);
    const isLegacyWorkTreeExists = yield* fs.exists(legacyWorkTreePath);

    if (!isWorkTreeExists && !isLegacyWorkTreeExists) {
      return;
    }

    const actualWorkTreePath = isWorkTreeExists ? workTreePath : legacyWorkTreePath;

    yield* git.removeWorkTree(repositoryPath, actualWorkTreePath);
    yield* fs.remove(actualWorkTreePath, { recursive: true, force: true });

    const remainingEntries = yield* fs
      .readDirectory(workTreeRepositoryPath)
      .pipe(
        Effect.catchTag("PlatformError", (error) =>
          error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(error),
        ),
      );

    if (remainingEntries.length === 0) {
      yield* fs.remove(workTreeRepositoryPath, { recursive: true, force: true });
    }
  });
