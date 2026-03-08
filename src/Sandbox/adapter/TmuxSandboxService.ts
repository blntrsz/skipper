import { Effect } from "effect";
import type { GitRepository } from "@/domain/GitRepository";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";
import { TmuxService, TmuxServiceImpl } from "@/internal/TmuxService";

const sessionName = (config: GitRepository) =>
  `${config.repository}-${config.branch}`;

export const attach = (config: GitRepository) =>
  Effect.gen(function* () {
    const tmux = yield* TmuxService;
    const path =
      config.branch === "main"
        ? RepositoryPath.make(config.repository)
        : WorkTreePath.make(config);

    yield* tmux.attachSession(sessionName(config), path);
  }).pipe(Effect.provide(TmuxServiceImpl));
