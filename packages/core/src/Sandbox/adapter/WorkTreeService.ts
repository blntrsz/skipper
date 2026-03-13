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
    const workTreePath = Path.makeWorkTreePath(config);
    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (!isWorkTreeExists) {
      return;
    }

    yield* git.removeWorkTree(repositoryPath, workTreePath);
    yield* fs.remove(workTreePath, { recursive: true, force: true });
  });
