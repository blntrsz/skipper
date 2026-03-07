import { Effect, FileSystem, Match, pipe, ServiceMap, Option } from "effect";
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
  action: "create" | "remove" | "picker",
  type: SandboxConfig["type"]
) =>
  Effect.gen(function* () {
    yield* Effect.logError("Sandbox backend not implemented");
    yield* Effect.die(`Sandbox backend '${type}'.'${action}' not implemented`);
  });

const resolveGitRepository = (git: GitRepositoryOption) =>
  Effect.gen(function* () {
    const fuzzy = yield* FuzzyFindService;
    const fs = yield* FileSystem.FileSystem;
    const interactiveGitRepository =
      Option.isNone(git.repository) && Option.isNone(git.branch)
        ? yield* fuzzy.searchGitRepository()
        : null;

    if (
      Option.isNone(git.repository) &&
      Option.isNone(git.branch) &&
      interactiveGitRepository === null
    ) {
      throw new Error("No repository/worktree selected");
    }

    const repository = Option.isSome(git.repository)
      ? git.repository.value
      : interactiveGitRepository?.repository ??
        (yield* fuzzy.searchInDirectory(RepositoryPath.root(), {
          throwOnNotFound: true,
        }));
    const branch = Option.isSome(git.branch)
      ? git.branch.value
      : interactiveGitRepository?.branch ??
        (yield* Effect.gen(function* () {
          const workTreeRepositoryPath = WorkTreePath.makeRepositoryPath({
            repository,
            branch: "main",
          });

          const workTreeRepositoryExists = yield* fs.exists(
            workTreeRepositoryPath
          );

          if (!workTreeRepositoryExists) {
            return "main";
          }

          return yield* fuzzy.searchInDirectory(workTreeRepositoryPath, {
            additionalOptions: ["main"],
            throwOnNotFound: true,
          });
        }));

    return GitRepository.makeUnsafe({
      repository,
      branch,
    });
  }).pipe(Effect.provide(FuzzyFindServiceImpl));

export const SandboxServiceImpl = ServiceMap.make(SandboxService, {
  create: (config, git) =>
    Effect.gen(function* () {
      const gitRepository = yield* resolveGitRepository(git);

      yield* TmuxWorktreeSandbox.create(gitRepository);

      yield* Effect.logInfo("Workflow created");
    }),
  picker: (config, git) =>
    Effect.gen(function* () {
      const gitRepository = yield* resolveGitRepository(git);

      const matcher = pipe(
        Match.type<SandboxConfig>(),
        Match.discriminator("type")("tmux-worktree", () =>
          TmuxWorktreeSandbox.create(gitRepository)
        ),
        Match.discriminator("type")("tmux-main", () =>
          notImplemented("picker", "tmux-main")
        ),
        Match.discriminator("type")("docker", () =>
          notImplemented("picker", "docker")
        ),
        Match.discriminator("type")("ecs", () =>
          notImplemented("picker", "ecs")
        ),
        Match.exhaustive
      );

      yield* matcher(config);
    }),
  remove: (config, git) =>
    Effect.gen(function* () {
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

      yield* Effect.logInfo("Workflow removed");
    }),
});
