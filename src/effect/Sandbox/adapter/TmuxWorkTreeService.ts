import { Effect, FileSystem } from "effect";
import { TmuxWorkTreeSandboxConfig } from "@/effect/domain/Sandbox";
import * as WorkTreePath from "@/effect/domain/WorkTreePath";
import * as RepositoryPath from "@/effect/domain/RepositoryPath";

import { GitService, GitServiceImpl } from "@/effect/internal/GitService";
import { TmuxService, TmuxServiceImpl } from "@/effect/internal/TmuxService";

export const create = (config: TmuxWorkTreeSandboxConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;
    const tmux = yield* TmuxService;

    yield* Effect.logInfo("Create tmux-worktree sandbox");

    const repositoryPath = RepositoryPath.make(config.git);
    const workTreePath = WorkTreePath.make(config.git);
    const sessionName = `${config.git.repository}_${config.git.branch}`;

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

export const remove = (config: TmuxWorkTreeSandboxConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = yield* GitService;

    yield* Effect.logInfo("Remove tmux-worktree sandbox");

    const repositoryPath = RepositoryPath.make(config.git);
    const workTreePath = WorkTreePath.make(config.git);

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
