import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Option, ServiceMap } from "effect";
import { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";
import { pickOne, PickerCancelled } from "@/internal/InteractivePicker";
import { TmuxService, TmuxServiceImpl } from "@/internal/TmuxService";

const isInteractive = () =>
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.env.CI === undefined;

const hasTerminal = () =>
  process.stdin.isTTY === true && process.stdout.isTTY === true;

const isNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

const pathExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
};

const listDirectoryNames = async (path: string) => {
  try {
    const entries = await readdir(path, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }
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
  const sanitize = (value: string) => {
    const clean = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean.length === 0 ? "default" : clean;
  };

  return `${sanitize(repository)}--${sanitize(branch)}`;
};

export const resolveTargetPath = (repository: string, branch: string) =>
  branch === "main"
    ? RepositoryPath.make(repository)
    : WorkTreePath.make({ repository, branch });

export const listRepositories = (root = RepositoryPath.root()) =>
  Effect.tryPromise({
    try: async () => {
      const repositories = await listDirectoryNames(root);
      const checks = await Promise.all(
        repositories.map(async (repository) => ({
          repository,
          exists: await pathExists(join(root, repository, ".git")),
        }))
      );

      return checks
        .filter((entry) => entry.exists)
        .map((entry) => entry.repository)
        .sort((left, right) => left.localeCompare(right));
    },
    catch: (error) =>
      new UnknownError(error, `Failed to list repositories in '${root}'`),
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
    const repositoryExists = yield* Effect.tryPromise({
      try: () => pathExists(repositoryPath),
      catch: (error) =>
        new UnknownError(error, `Failed to read repository '${repository}'`),
    });

    if (!repositoryExists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Repository '${repository}' not found in '${repositoryRoot}'`
        )
      );
    }

    const branches = yield* Effect.tryPromise({
      try: () => listDirectoryNames(join(workTreeRoot, repository)),
      catch: (error) =>
        new UnknownError(error, `Failed to list branches for '${repository}'`),
    });

    return sortBranches(["main", ...branches]);
  });

const ensureInteractive = <A>(effect: Effect.Effect<A, UnknownError | PickerCancelled>) =>
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
      repositories.map((repository) => ({ label: repository, value: repository }))
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
  }) => Effect.Effect<void, PlatformError | UnknownError | PickerCancelled, ChildProcessSpawner>;
}>("SwitchService");

const run: (typeof SwitchService.Service)["run"] = (input) =>
  Effect.gen(function* () {
    if (!hasTerminal()) {
      return yield* Effect.fail(
        new UnknownError(undefined, "Switch requires an interactive terminal")
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
    const targetExists = yield* Effect.tryPromise({
      try: () => pathExists(targetPath),
      catch: (error) =>
        new UnknownError(error, `Failed to resolve path for '${repository}:${branch}'`),
    });

    if (!targetExists) {
      return yield* Effect.fail(
        new UnknownError(
          undefined,
          `Target path '${targetPath}' not found for '${repository}:${branch}'`
        )
      );
    }

    const tmux = yield* TmuxService;
    yield* tmux.attachSession(makeSessionName(repository, branch), targetPath);
  }).pipe(Effect.provide(TmuxServiceImpl));

export const SwitchServiceImpl = ServiceMap.make(SwitchService, {
  run,
});
