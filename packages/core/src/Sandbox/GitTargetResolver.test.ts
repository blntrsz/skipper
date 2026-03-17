import { BunFileSystem } from "@effect/platform-bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Option } from "effect";
import * as Path from "../domain/Path";
import {
  PickerCancelled,
  type PickerService as PickerServiceShape,
  PickerService,
} from "../internal/Picker/PickerService";
import { resolveGitTarget } from "./GitTargetResolver";

const originalRepositoryRoot = process.env.SKIPPER_REPOSITORY_ROOT;
const originalWorkTreeRoot = process.env.SKIPPER_WORKTREE_ROOT;
const stdinTTY = process.stdin.isTTY;
const stdoutTTY = process.stdout.isTTY;
const originalCI = process.env.CI;

const setTTY = (value: boolean) => {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value });
};

const withResolver = (
  git: Path.GitRepositoryOption,
  picker: PickerServiceShape,
  message = "sandbox rm requires a TTY when --repository or --branch is missing",
) =>
  Effect.runPromise(
    resolveGitTarget(git, { missingMessage: message }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, Layer.succeed(PickerService, picker))),
    ),
  );

const setupRoots = async () => {
  const root = await mkdtemp(join(tmpdir(), "skipper-git-target-"));
  const repositoryRoot = join(root, "repos");
  const workTreeRoot = join(root, "worktrees");

  process.env.SKIPPER_REPOSITORY_ROOT = repositoryRoot;
  process.env.SKIPPER_WORKTREE_ROOT = workTreeRoot;

  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(workTreeRoot, { recursive: true });

  return { repositoryRoot, workTreeRoot };
};

const createRepository = async (repositoryRoot: string, repository: string) => {
  await mkdir(join(repositoryRoot, repository), { recursive: true });
  await writeFile(join(repositoryRoot, repository, ".git"), "gitdir");
};

const createWorktree = async (workTreeRoot: string, repository: string, branch: string) => {
  const workTreePath = join(workTreeRoot, repository, `${repository}.${branch}`);
  await mkdir(workTreePath, { recursive: true });
  await writeFile(join(workTreePath, ".git"), "gitdir");
};

describe("resolveGitTarget", () => {
  beforeEach(() => {
    delete process.env.CI;
    setTTY(true);
  });

  afterEach(() => {
    if (originalRepositoryRoot === undefined) {
      delete process.env.SKIPPER_REPOSITORY_ROOT;
    } else {
      process.env.SKIPPER_REPOSITORY_ROOT = originalRepositoryRoot;
    }

    if (originalWorkTreeRoot === undefined) {
      delete process.env.SKIPPER_WORKTREE_ROOT;
    } else {
      process.env.SKIPPER_WORKTREE_ROOT = originalWorkTreeRoot;
    }

    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: stdinTTY });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: stdoutTTY });
  });

  test("picks repository when missing and validates provided branch", async () => {
    const { repositoryRoot, workTreeRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    await createRepository(repositoryRoot, "repo-b");
    await createWorktree(workTreeRoot, "repo-a", "feature");

    const picks: Array<{ message: string; options: string[] }> = [];
    const picker: PickerServiceShape = {
      pick: ({ message, options }) => {
        picks.push({ message, options });
        return Effect.succeed("repo-a");
      },
    };

    const result = await withResolver(
      Path.GitRepositoryOption.makeUnsafe({
        repository: Option.none(),
        branch: Option.some("feature"),
      }),
      picker,
    );

    expect(result).toEqual({ repository: "repo-a", branch: "feature" });
    expect(picks).toEqual([{ message: "Repository", options: ["repo-a", "repo-b"] }]);
  });

  test("picks branch when repository is provided", async () => {
    const { repositoryRoot, workTreeRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    await createWorktree(workTreeRoot, "repo-a", "feature");

    const picks: Array<{ message: string; options: string[] }> = [];
    const picker: PickerServiceShape = {
      pick: ({ message, options }) => {
        picks.push({ message, options });
        return Effect.succeed("feature");
      },
    };

    const result = await withResolver(
      Path.GitRepositoryOption.makeUnsafe({
        repository: Option.some("repo-a"),
        branch: Option.none(),
      }),
      picker,
    );

    expect(result).toEqual({ repository: "repo-a", branch: "feature" });
    expect(picks).toEqual([{ message: "Branch", options: ["main", "feature"] }]);
  });

  test("picks repository then branch when both are missing", async () => {
    const { repositoryRoot, workTreeRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    await createWorktree(workTreeRoot, "repo-a", "feature");

    const picks: string[] = [];
    const picker: PickerServiceShape = {
      pick: ({ message }) => {
        picks.push(message);
        return Effect.succeed(message === "Repository" ? "repo-a" : "feature");
      },
    };

    const result = await withResolver(
      Path.GitRepositoryOption.makeUnsafe({
        repository: Option.none(),
        branch: Option.none(),
      }),
      picker,
    );

    expect(result).toEqual({ repository: "repo-a", branch: "feature" });
    expect(picks).toEqual(["Repository", "Branch"]);
  });

  test("fails when tty is missing and repository or branch is omitted", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    setTTY(false);

    const picker: PickerServiceShape = {
      pick: () => Effect.die("picker should not run"),
    };

    await expect(
      withResolver(
        Path.GitRepositoryOption.makeUnsafe({
          repository: Option.some("repo-a"),
          branch: Option.none(),
        }),
        picker,
      ),
    ).rejects.toMatchObject({
      message: "sandbox rm requires a TTY when --repository or --branch is missing",
    });
  });

  test("bubbles picker cancel", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");

    const picker: PickerServiceShape = {
      pick: () => Effect.fail(new PickerCancelled({})),
    };

    await expect(
      withResolver(
        Path.GitRepositoryOption.makeUnsafe({
          repository: Option.none(),
          branch: Option.none(),
        }),
        picker,
      ),
    ).rejects.toBeInstanceOf(PickerCancelled);
  });

  test("fails for invalid provided branch", async () => {
    const { repositoryRoot, workTreeRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    await createWorktree(workTreeRoot, "repo-a", "feature");

    const picker: PickerServiceShape = {
      pick: () => Effect.die("picker should not run"),
    };

    await expect(
      withResolver(
        Path.GitRepositoryOption.makeUnsafe({
          repository: Option.some("repo-a"),
          branch: Option.some("missing"),
        }),
        picker,
      ),
    ).rejects.toMatchObject({
      message: "Branch 'missing' not found for 'repo-a'",
    });
  });

  test("keeps main branch valid", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");

    const picker: PickerServiceShape = {
      pick: () => Effect.die("picker should not run"),
    };

    const result = await withResolver(
      Path.GitRepositoryOption.makeUnsafe({
        repository: Option.some("repo-a"),
        branch: Option.some("main"),
      }),
      picker,
    );

    expect(result).toEqual({ repository: "repo-a", branch: "main" });
  });
});
