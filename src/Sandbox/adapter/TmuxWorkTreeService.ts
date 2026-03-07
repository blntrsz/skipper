import { Effect, FileSystem } from "effect";
import * as WorkTreePath from "@/domain/WorkTreePath";
import * as RepositoryPath from "@/domain/RepositoryPath";

import { GitService, GitServiceImpl } from "@/internal/GitService";
import { TmuxService, TmuxServiceImpl } from "@/internal/TmuxService";
import type { GitRepository } from "@/domain/GitRepository";

export const create = (config: GitRepository) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;
    const tmux = yield* TmuxService;

    const repositoryPath = RepositoryPath.make(config.repository);
    const workTreeRepositoryPath = WorkTreePath.makeRepositoryPath(config);
    const workTreePath = WorkTreePath.make(config);
    const sessionName = `${config.repository}-${config.branch}`;

    if (config.branch === "main") {
      yield* tmux.attachSession(sessionName, repositoryPath);
      return;
    }

    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (!isWorkTreeExists) {
      yield* fs.makeDirectory(workTreeRepositoryPath, { recursive: true });
      yield* git.createWorkTree(repositoryPath, workTreePath);
    }

    yield* tmux.attachSession(sessionName, workTreePath);
  }).pipe(Effect.provide(GitServiceImpl), Effect.provide(TmuxServiceImpl));

export const remove = (config: GitRepository) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;

    if (config.branch === "main") {
      return;
    }

    const repositoryPath = RepositoryPath.make(config.repository);
    const workTreePath = WorkTreePath.make(config);

    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (isWorkTreeExists) {
      yield* git.removeWorkTree(repositoryPath, workTreePath);
      yield* fs.remove(workTreePath, { recursive: true, force: true });
    }
  }).pipe(Effect.provide(GitServiceImpl));
