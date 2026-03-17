import { join } from "node:path";
import { Effect, FileSystem, Option } from "effect";
import { UnknownError } from "effect/Cause";
import type { GitRepository, GitRepositoryOption } from "../domain/Path";
import * as Path from "../domain/Path";
import {
  type PickerCancelled,
  type PickerError,
  type PickerNoMatch,
  PickerService,
} from "../internal/Picker/PickerService";

const isInteractive = () =>
  process.stdin.isTTY === true && process.stdout.isTTY === true && process.env.CI === undefined;

export const hasTerminal = () => process.stdin.isTTY === true && process.stdout.isTTY === true;

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
        error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(error),
      ),
      Effect.mapError((error) => new UnknownError(error, `Failed to list '${path}'`)),
    );
    const values = yield* Effect.forEach(entries, (entry) =>
      fs.stat(join(path, entry)).pipe(
        Effect.map((stats) => (stats.type === "Directory" ? entry : null)),
        Effect.mapError((error) => new UnknownError(error, `Failed to list '${path}'`)),
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
    ): Effect.Effect<Array<string>, UnknownError, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(directory).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(error),
          ),
          Effect.mapError((error) => new UnknownError(error, `Failed to list '${directory}'`)),
        );
        const values = yield* Effect.forEach(entries, (entry) =>
          Effect.gen(function* () {
            const entryPath = join(directory, entry);
            const stats = yield* fs
              .stat(entryPath)
              .pipe(
                Effect.mapError(
                  (error) => new UnknownError(error, `Failed to list '${directory}'`),
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
                  (error) => new UnknownError(error, `Failed to list '${entryPath}'`),
                ),
              );

            return isWorkTree ? [nextParts.join("/")] : yield* walk(entryPath, nextParts);
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
        (error) => new UnknownError(error, `Failed to read repository '${repository}'`),
      ),
    );

    if (!repositoryExists) {
      return yield* Effect.fail(
        new UnknownError(undefined, `Repository '${repository}' not found in '${repositoryRoot}'`),
      );
    }

    const branches = yield* listWorkTreePaths(join(workTreeRoot, repository)).pipe(
      Effect.mapError(
        (error) => new UnknownError(error, `Failed to list branches for '${repository}'`),
      ),
    );

    return sortBranches([
      "main",
      ...branches.map((path) => Path.workTreeRelativePathToBranch(repository, path)),
    ]);
  });

export const ensureInteractive = <A, E, R>(message: string, effect: Effect.Effect<A, E, R>) =>
  isInteractive() ? effect : Effect.fail(new UnknownError(undefined, message));

export const resolveRepository = (repository: string, repositories: ReadonlyArray<string>) =>
  repositories.includes(repository)
    ? Effect.succeed(repository)
    : Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${Path.repositoryRoot()}'`,
        ),
      );

export const resolveBranch = (
  repository: string,
  branch: string,
  branches: ReadonlyArray<string>,
) =>
  branches.includes(branch)
    ? Effect.succeed(branch)
    : Effect.fail(new UnknownError(undefined, `Branch '${branch}' not found for '${repository}'`));

export const pickRepository = (repositories: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const picker = yield* PickerService;
    return yield* picker.pick({
      message: "Repository",
      options: [...repositories],
    });
  });

export const pickBranch = (branches: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const picker = yield* PickerService;
    return yield* picker.pick({
      message: "Branch",
      options: [...branches],
    });
  });

export const resolveGitTarget = (
  git: GitRepositoryOption,
  options: {
    readonly missingMessage: string;
  },
) =>
  Effect.gen(function* () {
    const repositories = yield* listRepositories();

    if (repositories.length === 0) {
      return yield* Effect.fail(
        new UnknownError(undefined, `No repositories found in '${Path.repositoryRoot()}'`),
      );
    }

    const repository = Option.isSome(git.repository)
      ? yield* resolveRepository(git.repository.value, repositories)
      : yield* ensureInteractive(options.missingMessage, pickRepository(repositories));

    const branches = yield* listBranches(repository);
    const branch = Option.isSome(git.branch)
      ? yield* resolveBranch(repository, git.branch.value, branches)
      : yield* ensureInteractive(options.missingMessage, pickBranch(branches));

    return Path.GitRepository.makeUnsafe({ repository, branch }) satisfies GitRepository;
  }) as Effect.Effect<
    GitRepository,
    UnknownError | PickerCancelled | PickerError | PickerNoMatch,
    FileSystem.FileSystem | typeof PickerService.Service
  >;
