import { join } from "node:path";
import { Effect, FileSystem, Layer, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as RepositoryPath from "@/domain/RepositoryPath";
import type { GitRepository } from "@/domain/GitRepository";
import { resolveWorkspacePath } from "@/domain/WorkspacePath";
import * as WorkTreePath from "@/domain/WorkTreePath";
import { pickOne, PickerCancelled } from "@/internal/InteractivePicker";
import { sanitizeNameSegment } from "@/internal/SkipperPaths";
import { TmuxError } from "@/internal/TmuxError";
import { TmuxService } from "@/internal/TmuxService";

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
          : Effect.fail(error)
      ),
      Effect.mapError(
        (error) => new UnknownError(error, `Failed to list '${path}'`)
      )
    );
    const values = yield* Effect.forEach(entries, (entry) =>
      fs.stat(join(path, entry)).pipe(
        Effect.map((stats) => (stats.type === "Directory" ? entry : null)),
        Effect.mapError(
          (error) => new UnknownError(error, `Failed to list '${path}'`)
        )
      )
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
      parts: ReadonlyArray<string>
    ): Effect.Effect<Array<string>, UnknownError> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(directory).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed([])
              : Effect.fail(error)
          ),
          Effect.mapError(
            (error) => new UnknownError(error, `Failed to list '${directory}'`)
          )
        );
        const values = yield* Effect.forEach(entries, (entry) =>
          Effect.gen(function* () {
            const entryPath = join(directory, entry);
            const stats = yield* fs
              .stat(entryPath)
              .pipe(
                Effect.mapError(
                  (error) =>
                    new UnknownError(error, `Failed to list '${directory}'`)
                )
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
                    new UnknownError(error, `Failed to list '${entryPath}'`)
                )
              );

            return isWorkTree
              ? [nextParts.join("/")]
              : yield* walk(entryPath, nextParts);
          })
        );

        return values.flat();
      });

    return yield* walk(path, []);
  });

const workTreePathToBranch = (repository: string, path: string) => {
  const [head = "", ...tail] = path.split(/[\\/]/);
  const prefix = `${repository}.`;

  return [head.startsWith(prefix) ? head.slice(prefix.length) : head, ...tail]
    .filter((value) => value.length > 0)
    .join("/");
};

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
  return `${sanitizeNameSegment(repository)}-${sanitizeNameSegment(branch)}`;
};

export const resolveTargetPath = (repository: string, branch: string) =>
  resolveWorkspacePath({ repository, branch } satisfies GitRepository);

export const listRepositories = (root = RepositoryPath.root()) =>
  Effect.gen(function* () {
    const repositories = yield* listDirectoryNames(root);
    const checks = yield* Effect.forEach(repositories, (repository) =>
      Effect.gen(function* () {
        const exists = yield* pathExists(join(root, repository, ".git"));
        return { repository, exists };
      })
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
  }
) =>
  Effect.gen(function* () {
    const repositoryRoot = options?.repositoryRoot ?? RepositoryPath.root();
    const workTreeRoot = options?.workTreeRoot ?? WorkTreePath.root();
    const repositoryPath = join(repositoryRoot, repository);
    const repositoryExists = yield* pathExists(repositoryPath).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(error, `Failed to read repository '${repository}'`)
      )
    );

    if (!repositoryExists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${repositoryRoot}'`
        )
      );
    }

    const branches = yield* listWorkTreePaths(
      join(workTreeRoot, repository)
    ).pipe(
      Effect.mapError(
        (error) =>
          new UnknownError(error, `Failed to list branches for '${repository}'`)
      )
    );

    return sortBranches([
      "main",
      ...branches.map((path) => workTreePathToBranch(repository, path)),
    ]);
  });

const ensureInteractive = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  isInteractive()
    ? effect
    : Effect.fail(
        new UnknownError(
          undefined,
          "Switch requires a TTY when --repository or --branch is missing"
        )
      );

const resolveRepository = (repository: string) =>
  Effect.gen(function* () {
    const repositories = yield* listRepositories();

    if (!repositories.includes(repository)) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${RepositoryPath.root()}'`
        )
      );
    }

    return repository;
  });

const resolveBranch = (
  repository: string,
  branch: string,
  availableBranches: ReadonlyArray<string>
) =>
  availableBranches.includes(branch)
    ? Effect.succeed(branch)
    : Effect.fail(
        new UnknownError(
          undefined,
          `Branch '${branch}' not found for '${repository}'`
        )
      );

const pickRepository = () =>
  Effect.gen(function* () {
    const repositories = yield* listRepositories();

    if (repositories.length === 0) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `No repositories found in '${RepositoryPath.root()}'`
        )
      );
    }

    return yield* pickOne(
      "Repository",
      repositories.map((repository) => ({
        label: repository,
        value: repository,
      }))
    );
  });

const pickBranch = (branches: ReadonlyArray<string>) =>
  pickOne(
    "Branch",
    branches.map((branch) => ({ label: branch, value: branch }))
  );

export const SwitchService = ServiceMap.Service<{
  run: (input: {
    readonly repository: Option.Option<string>;
    readonly branch: Option.Option<string>;
  }) => Effect.Effect<
    void,
    PlatformError | UnknownError | PickerCancelled | TmuxError,
    ChildProcessSpawner | FileSystem.FileSystem
  >;
}>("SwitchService");

export const SwitchServiceImpl = Layer.effect(
  SwitchService,
  Effect.gen(function* () {
    const tmux = yield* TmuxService;

    const run: (typeof SwitchService.Service)["run"] = (input) =>
      Effect.gen(function* () {
        if (!hasTerminal()) {
          return yield* Effect.fail(
            new UnknownError(
              undefined,
              "Switch requires an interactive terminal"
            )
          );
        }

        const repository = Option.isSome(input.repository)
          ? yield* resolveRepository(input.repository.value)
          : yield* ensureInteractive(pickRepository());
        const branches = yield* listBranches(repository);
        const branch = Option.isSome(input.branch)
          ? yield* resolveBranch(repository, input.branch.value, branches)
          : yield* ensureInteractive(pickBranch(branches));
        const targetPath = resolveTargetPath(repository, branch);
        const targetExists = yield* pathExists(targetPath).pipe(
          Effect.mapError(
            (error) =>
              new UnknownError(
                error,
                `Failed to resolve path for '${repository}:${branch}'`
              )
          )
        );

        if (!targetExists) {
          return yield* Effect.fail(
            new UnknownError(
              undefined,
              `Target path '${targetPath}' not found for '${repository}:${branch}'`
            )
          );
        }

        yield* tmux.attachSession(
          makeSessionName(repository, branch),
          targetPath
        );
      });

    return { run } satisfies typeof SwitchService.Service;
  })
);
