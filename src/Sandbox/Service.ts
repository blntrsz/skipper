import { Effect, Match, pipe, ServiceMap, Option } from "effect";
import { SandboxService } from "./Port";
import type { SandboxConfig } from "../domain/Sandbox";
import * as TmuxWorktreeSandbox from "./adapter/TmuxWorkTreeService";
import {
  FuzzyFindService,
  FuzzyFindServiceImpl,
} from "../internal/FuzzyFindService";
import * as WorkTreePath from "../domain/WorkTreePath";
import { GitRepository, GitRepositoryOption } from "../domain/GitRepository";
import * as RepositoryPath from "../domain/RepositoryPath";

const notImplemented = (
  action: "create" | "remove",
  type: SandboxConfig["type"]
) =>
  Effect.gen(function* () {
    yield* Effect.logError("Sandbox backend not implemented");
    yield* Effect.die(`Sandbox backend '${type}'.'${action}' not implemented`);
  });

const resolveGitRepository = (git: GitRepositoryOption) =>
  Effect.gen(function* () {
    const fuzzy = yield* FuzzyFindService;
    const repository = Option.isSome(git.repository)
      ? git.repository.value
      : yield* fuzzy.searchInDirectory(RepositoryPath.root(), {
          throwOnNotFound: true,
        });
    const branch = Option.isSome(git.branch)
      ? git.branch.value
      : yield* fuzzy.searchInDirectory(WorkTreePath.make(repository));

    return GitRepository.makeUnsafe({
      repository,
      branch,
    });
  }).pipe(Effect.provide(FuzzyFindServiceImpl));

export const SandboxServiceImpl = ServiceMap.make(SandboxService, {
  create: (config, git) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Dispatch sandbox create");
      const gitRepository = yield* resolveGitRepository(git);

      const matcher = pipe(
        Match.type<SandboxConfig>(),
        Match.discriminator("type")("tmux-worktree", () =>
          TmuxWorktreeSandbox.create(gitRepository)
        ),
        Match.discriminator("type")("tmux-main", () =>
          notImplemented("create", "tmux-main")
        ),
        Match.discriminator("type")("docker", () =>
          notImplemented("create", "docker")
        ),
        Match.discriminator("type")("ecs", () =>
          notImplemented("create", "ecs")
        ),
        Match.exhaustive
      );

      yield* matcher(config);

      yield* Effect.logInfo("Sandbox create finished");
    }),
  remove: (config, git) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Dispatch sandbox remove");
      const gitRepository = yield* resolveGitRepository(git);

      const matcher = pipe(
        Match.type<SandboxConfig>(),
        Match.discriminator("type")("tmux-worktree", () =>
          TmuxWorktreeSandbox.remove(gitRepository)
        ),
        Match.discriminator("type")("tmux-main", () =>
          notImplemented("remove", "tmux-main")
        ),
        Match.discriminator("type")("docker", () =>
          notImplemented("remove", "docker")
        ),
        Match.discriminator("type")("ecs", () =>
          notImplemented("remove", "ecs")
        ),
        Match.exhaustive
      );

      yield* matcher(config);

      yield* Effect.logInfo("Sandbox remove finished");
    }),
});
