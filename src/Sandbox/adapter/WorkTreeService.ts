import { Effect, FileSystem } from "effect";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";
import type { GitRepository } from "@/domain/GitRepository";
import { GitService } from "@/internal/GitService";

export const create = (config: GitRepository) =>
  Effect.gen(function* () {
    if (config.branch === "main") {
      yield* Effect.logInfo("Skipped worktree create for main branch");
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;
    const repositoryPath = RepositoryPath.make(config.repository);
    const workTreeRepositoryPath = WorkTreePath.makeRepositoryPath(config);
    const workTreePath = WorkTreePath.make(config);
    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (isWorkTreeExists) {
      return;
    }

    yield* fs.makeDirectory(workTreeRepositoryPath, { recursive: true });
    yield* git.createWorkTree(repositoryPath, workTreePath);
  });

export const remove = (config: GitRepository) =>
  Effect.gen(function* () {
    if (config.branch === "main") {
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;
    const repositoryPath = RepositoryPath.make(config.repository);
    const workTreePath = WorkTreePath.make(config);
    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (!isWorkTreeExists) {
      return;
    }

    yield* git.removeWorkTree(repositoryPath, workTreePath);
    yield* fs.remove(workTreePath, { recursive: true, force: true });
  });
