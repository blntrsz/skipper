import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import { Prompt } from "effect/unstable/cli";
import * as Path from "../domain/Path";
import { type GitRepository, GitRepository as GitRepositorySchema } from "../domain/Path";
import { Git, Tmux } from "../internal";
import { PickerCancelled, PickerService } from "../internal/Picker/PickerService";
import {
  ensureInteractive,
  hasTerminal,
  listBranches,
  listRepositories,
  resolveBranch,
  resolveRepository,
} from "./GitTargetResolver";
import { SwitchService } from "./SwitchService";

const pathExists = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path);
  });

export const makeSessionName = (repository: string, branch: string) => {
  return `${Path.sanitizeNameSegment(repository)}-${Path.sanitizeNameSegment(branch)}`;
};

export const resolveTargetPath = (repository: string, branch: string) =>
  Path.resolveWorkspacePath({ repository, branch } satisfies GitRepository);

const promptForBranchName = Prompt.run(
  Prompt.text({
    message: "Branch name",
    validate: (value) => {
      const branch = value.trim();
      return branch.length > 0 ? Effect.succeed(branch) : Effect.fail("Branch name is required");
    },
  }),
).pipe(Effect.mapError(() => new PickerCancelled({})));

const run: SwitchService["run"] = (input) =>
  Effect.gen(function* () {
    if (!hasTerminal()) {
      return yield* Effect.fail(
        new UnknownError(undefined, "Switch requires an interactive terminal"),
      );
    }

    const repositoryOption = input.repository;
    let repository: string;
    if (Option.isSome(repositoryOption)) {
      repository = yield* listRepositories().pipe(
        Effect.flatMap((repositories) => resolveRepository(repositoryOption.value, repositories)),
      );
    } else {
      repository = yield* ensureInteractive(
        "Switch requires a TTY when --repository or --branch is missing",
        Effect.gen(function* () {
          const picker = yield* PickerService;
          const repositories = yield* listRepositories();
          if (repositories.length === 0) {
            return yield* Effect.fail(
              new UnknownError(undefined, `No repositories found in '${Path.repositoryRoot()}'`),
            );
          }
          return yield* picker.pick({
            message: "Repository",
            options: repositories,
          });
        }),
      );
    }

    if (input.create) {
      const git = yield* Git.GitService;
      const branch = yield* ensureInteractive(
        "Switch requires a TTY when --repository or --branch is missing",
        promptForBranchName,
      );

      const repositoryPath = Path.makeRepositoryPath(repository);
      const workTreePath = Path.makeWorkTreePath({ repository, branch });
      const workTreeRepositoryPath = Path.makeWorkTreeRepositoryPath({
        repository,
      });

      const fs = yield* FileSystem.FileSystem;
      const isWorkTreeExists = yield* fs.exists(workTreePath);

      if (!isWorkTreeExists) {
        yield* fs.makeDirectory(workTreeRepositoryPath, {
          recursive: true,
        });
        yield* git.createWorkTree(
          repositoryPath,
          workTreePath,
          GitRepositorySchema.makeUnsafe({ repository, branch }),
        );
      }

      const targetPath = resolveTargetPath(repository, branch);
      const tmux = yield* Tmux.TmuxService;
      yield* tmux.attachSession(makeSessionName(repository, branch), targetPath);
      return;
    }

    const branches = yield* listBranches(repository);
    const branchOption = input.branch;
    let branch: string;
    if (Option.isSome(branchOption)) {
      branch = yield* resolveBranch(repository, branchOption.value, branches);
    } else {
      branch = yield* ensureInteractive(
        "Switch requires a TTY when --repository or --branch is missing",
        Effect.gen(function* () {
          const picker = yield* PickerService;
          return yield* picker.pick({
            message: "Branch",
            options: [...branches],
          });
        }),
      );
    }
    const targetPath = resolveTargetPath(repository, branch);
    const targetExists = yield* pathExists(targetPath).pipe(
      Effect.mapError(
        (error) => new UnknownError(error, `Failed to resolve path for '${repository}:${branch}'`),
      ),
    );

    if (!targetExists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Target path '${targetPath}' not found for '${repository}:${branch}'`,
        ),
      );
    }

    const tmux = yield* Tmux.TmuxService;
    yield* tmux.attachSession(makeSessionName(repository, branch), targetPath);
  });

export const TmuxSwitchService = ServiceMap.make(SwitchService, { run });
