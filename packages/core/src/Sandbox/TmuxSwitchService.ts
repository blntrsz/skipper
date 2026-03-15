import { join } from "node:path";
import { Effect, FileSystem, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import { Prompt } from "effect/unstable/cli";
import * as Path from "../domain/Path";
import {
  type GitRepository,
  GitRepository as GitRepositorySchema,
} from "../domain/Path";
import { Git, Tmux } from "../internal";
import {
  PickerCancelled,
  PickerService,
} from "../internal/Picker/PickerService";
import { SwitchService } from "./SwitchService";

const isInteractive = () =>
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.env.CI === undefined;

const hasTerminal = () =>
  process.stdin.isTTY === true && process.stdout.isTTY === true;

const pathExists = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path);
  });

const listDirectoryNames = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(path).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed([])
          : Effect.fail(error),
      ),
      Effect.mapError(
        (error) => new UnknownError(error, `Failed to list '${path}'`),
      ),
    );
    const values = yield* Effect.forEach(entries, (entry) =>
      fs.stat(join(path, entry)).pipe(
        Effect.map((stats) => (stats.type === "Directory" ? entry : null)),
        Effect.mapError(
          (error) => new UnknownError(error, `Failed to list '${path}'`),
        ),
      ),
    );

    return values
      .filter((value): value is string => value !== null)
      .sort((left, right) => left.localeCompare(right));
  });

const listWorkTreePaths = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const walk = (
      directory: string,
      parts: ReadonlyArray<string>,
    ): Effect.Effect<Array<string>, UnknownError> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(directory).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed([])
              : Effect.fail(error),
          ),
          Effect.mapError(
            (error) => new UnknownError(error, `Failed to list '${directory}'`),
          ),
        );
        const values = yield* Effect.forEach(entries, (entry) =>
          Effect.gen(function* () {
            const entryPath = join(directory, entry);
            const stats = yield* fs
              .stat(entryPath)
              .pipe(
                Effect.mapError(
                  (error) =>
                    new UnknownError(error, `Failed to list '${directory}'`),
                ),
              );

            if (stats.type !== "Directory") {
              return [] as Array<string>;
            }

            const nextParts = [...parts, entry];
            const isWorkTree = yield* fs
              .exists(join(entryPath, ".git"))
              .pipe(
                Effect.mapError(
                  (error) =>
                    new UnknownError(error, `Failed to list '${entryPath}'`),
                ),
              );

            return isWorkTree
              ? [nextParts.join("/")]
              : yield* walk(entryPath, nextParts);
          }),
        );

        return values.flat();
      });

    return yield* walk(path, []);
  });

export const sortBranches = (branches: ReadonlyArray<string>) =>
  [...new Set(branches)].sort((left, right) => {
    if (left === "main") {
      return -1;
    }

    if (right === "main") {
      return 1;
    }

    return left.localeCompare(right);
  });

export const makeSessionName = (repository: string, branch: string) => {
  return `${Path.sanitizeNameSegment(repository)}-${Path.sanitizeNameSegment(
    branch,
  )}`;
};

export const resolveTargetPath = (repository: string, branch: string) =>
  Path.resolveWorkspacePath({ repository, branch } satisfies GitRepository);

export const listRepositories = (root = Path.repositoryRoot()) =>
  Effect.gen(function* () {
    const repositories = yield* listDirectoryNames(root);
    const checks = yield* Effect.forEach(repositories, (repository) =>
      Effect.gen(function* () {
        const exists = yield* pathExists(join(root, repository, ".git"));
        return { repository, exists };
      }),
    );

    return checks
      .filter((entry) => entry.exists)
      .map((entry) => entry.repository)
      .sort((left, right) => left.localeCompare(right));
  });

export const listBranches = (
  repository: string,
  options?: {
    readonly repositoryRoot?: string;
    readonly workTreeRoot?: string;
  },
) =>
  Effect.gen(function* () {
    const repositoryRoot = options?.repositoryRoot ?? Path.repositoryRoot();
    const workTreeRoot = options?.workTreeRoot ?? Path.workTreeRoot();
    const repositoryPath = join(repositoryRoot, repository);
    const repositoryExists = yield* pathExists(repositoryPath).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(error, `Failed to read repository '${repository}'`),
      ),
    );

    if (!repositoryExists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${repositoryRoot}'`,
        ),
      );
    }

    const branches = yield* listWorkTreePaths(
      join(workTreeRoot, repository),
    ).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(
            error,
            `Failed to list branches for '${repository}'`,
          ),
      ),
    );

    return sortBranches([
      "main",
      ...branches.map((path) =>
        Path.workTreeRelativePathToBranch(repository, path),
      ),
    ]);
  });

const ensureInteractive = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  isInteractive()
    ? effect
    : Effect.fail(
        new UnknownError(
          undefined,
          "Switch requires a TTY when --repository or --branch is missing",
        ),
      );

const promptForBranchName = Prompt.run(
  Prompt.text({
    message: "Branch name",
    validate: (value) => {
      const branch = value.trim();
      return branch.length > 0
        ? Effect.succeed(branch)
        : Effect.fail("Branch name is required");
    },
  }),
).pipe(Effect.mapError(() => new PickerCancelled({})));

const resolveRepository = (repository: string) =>
  Effect.gen(function* () {
    const repositories = yield* listRepositories();

    if (!repositories.includes(repository)) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${Path.repositoryRoot()}'`,
        ),
      );
    }

    return repository;
  });

const resolveBranch = (
  repository: string,
  branch: string,
  availableBranches: ReadonlyArray<string>,
) =>
  availableBranches.includes(branch)
    ? Effect.succeed(branch)
    : Effect.fail(
        new UnknownError(
          undefined,
          `Branch '${branch}' not found for '${repository}'`,
        ),
      );

const run: SwitchService["run"] = (input) =>
  Effect.gen(function* () {
    if (!hasTerminal()) {
      return yield* Effect.fail(
        new UnknownError(undefined, "Switch requires an interactive terminal"),
      );
    }

    const repository = Option.isSome(input.repository)
      ? yield* resolveRepository(input.repository.value)
      : yield* ensureInteractive(
          Effect.gen(function* () {
            const picker = yield* PickerService;
            const repositories = yield* listRepositories();
            if (repositories.length === 0) {
              return yield* Effect.fail(
                new UnknownError(
                  undefined,
                  `No repositories found in '${Path.repositoryRoot()}'`,
                ),
              );
            }
            return yield* picker.pick({
              message: "Repository",
              options: repositories,
            });
          }),
        );

    if (input.create) {
      const git = yield* Git.GitService;
      const branch = yield* ensureInteractive(promptForBranchName);

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
      yield* tmux.attachSession(
        makeSessionName(repository, branch),
        targetPath,
      );
      return;
    }

    const branches = yield* listBranches(repository);
    const branch = Option.isSome(input.branch)
      ? yield* resolveBranch(repository, input.branch.value, branches)
      : yield* ensureInteractive(
          Effect.gen(function* () {
            const picker = yield* PickerService;
            return yield* picker.pick({
              message: "Branch",
              options: [...branches],
            });
          }),
        );
    const targetPath = resolveTargetPath(repository, branch);
    const targetExists = yield* pathExists(targetPath).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(
            error,
            `Failed to resolve path for '${repository}:${branch}'`,
          ),
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
