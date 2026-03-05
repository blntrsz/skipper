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

    yield* Effect.logInfo("Create tmux-worktree sandbox");

    const repositoryPath = RepositoryPath.make(config);
    const workTreePath = WorkTreePath.make(config.repository);
    const sessionName = `${config.repository}-${config.branch}`;

    yield* Effect.logDebug("Resolved sandbox paths");

    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (!isWorkTreeExists) {
      yield* Effect.logInfo("Worktree missing, creating");

      yield* fs.makeDirectory(repositoryPath, { recursive: true });
      yield* git.createWorkTree(repositoryPath, workTreePath);
    } else {
      yield* Effect.logInfo("Worktree exists, reusing");
    }

    yield* Effect.logInfo("Attaching tmux session");

    yield* tmux.attachSession(sessionName, workTreePath);

    yield* Effect.logInfo("Tmux session attach done");
  }).pipe(Effect.provide(GitServiceImpl), Effect.provide(TmuxServiceImpl));

export const remove = (config: GitRepository) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;

    yield* Effect.logInfo("Remove tmux-worktree sandbox");

    const repositoryPath = RepositoryPath.make(config);
    const workTreePath = WorkTreePath.make(config.repository);

    const isWorkTreeExists = yield* fs.exists(workTreePath);

    if (isWorkTreeExists) {
      yield* Effect.logInfo("Removing git worktree");

      yield* git.removeWorkTree(repositoryPath, workTreePath);
      yield* fs.remove(workTreePath, { recursive: true, force: true });

      yield* Effect.logInfo("Removed tmux-worktree sandbox");
    } else {
      yield* Effect.logInfo("Worktree missing, nothing to remove");
    }
  }).pipe(Effect.provide(GitServiceImpl));
