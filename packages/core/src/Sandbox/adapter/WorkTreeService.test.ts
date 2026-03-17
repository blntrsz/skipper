import { BunFileSystem } from "@effect/platform-bun";
import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { type GitService as GitServiceShape, GitService } from "../../internal/Git";
import { type ShellService as ShellServiceShape, ShellService } from "../../internal/Shell";
import { remove } from "./WorkTreeService";

const originalRepositoryRoot = process.env.SKIPPER_REPOSITORY_ROOT;
const originalWorkTreeRoot = process.env.SKIPPER_WORKTREE_ROOT;

const pathExists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

const setupRoots = async () => {
  const root = await mkdtemp(join(tmpdir(), "skipper-worktree-remove-"));
  const repositoryRoot = join(root, "repos");
  const workTreeRoot = join(root, "worktrees");

  process.env.SKIPPER_REPOSITORY_ROOT = repositoryRoot;
  process.env.SKIPPER_WORKTREE_ROOT = workTreeRoot;

  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(workTreeRoot, { recursive: true });

  return { repositoryRoot, workTreeRoot };
};

const createWorktree = async (workTreeRoot: string, repository: string, branch: string) => {
  const workTreePath = join(workTreeRoot, repository, `${repository}.${branch}`);
  await mkdir(workTreePath, { recursive: true });
  await writeFile(join(workTreePath, ".git"), "gitdir");
  return workTreePath;
};

const createLegacyWorktree = async (workTreeRoot: string, repository: string, branch: string) => {
  const workTreePath = join(workTreeRoot, repository, branch);
  await mkdir(workTreePath, { recursive: true });
  await writeFile(join(workTreePath, ".git"), "gitdir");
  return workTreePath;
};

const makeGitService = (calls: Array<{ repositoryPath: string; workTreePath: string }>) =>
  ({
    createWorkTree: () => Effect.die("not used"),
    removeWorkTree: (repositoryPath, workTreePath) =>
      Effect.sync(() => {
        calls.push({ repositoryPath, workTreePath });
      }),
    resolveGitRepository: () => Effect.die("not used"),
    resolveRepositoryName: () => Effect.die("not used"),
    ensureRepositoryExists: () => Effect.die("not used"),
  }) satisfies GitServiceShape;

const shellService: ShellServiceShape = {
  bool: () => Effect.die("not used"),
  $: () => Effect.die("not used"),
  exec: () => Effect.die("not used"),
};

const runRemove = (config: { repository: string; branch: string }, gitService: GitServiceShape) =>
  Effect.runPromise(
    remove(config).pipe(
      Effect.provide(
        Layer.mergeAll(
          BunFileSystem.layer,
          Layer.succeed(GitService, gitService),
          Layer.succeed(ShellService, shellService),
        ),
      ),
    ),
  );

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
});

describe("WorkTreeService.remove", () => {
  test("removes empty repository worktree dir after deleting last branch", async () => {
    const { workTreeRoot } = await setupRoots();
    const calls: Array<{ repositoryPath: string; workTreePath: string }> = [];
    const repositoryPath = join(workTreeRoot, "repo-a");
    const workTreePath = await createWorktree(workTreeRoot, "repo-a", "feature");

    await runRemove({ repository: "repo-a", branch: "feature" }, makeGitService(calls));

    expect(calls).toHaveLength(1);
    expect(await pathExists(workTreePath)).toBe(false);
    expect(await pathExists(repositoryPath)).toBe(false);
  });

  test("keeps repository worktree dir when other branches remain", async () => {
    const { workTreeRoot } = await setupRoots();
    const calls: Array<{ repositoryPath: string; workTreePath: string }> = [];
    const repositoryPath = join(workTreeRoot, "repo-a");
    const removedPath = await createWorktree(workTreeRoot, "repo-a", "feature");
    const keptPath = await createWorktree(workTreeRoot, "repo-a", "bugfix");

    await runRemove({ repository: "repo-a", branch: "feature" }, makeGitService(calls));

    expect(calls).toHaveLength(1);
    expect(await pathExists(removedPath)).toBe(false);
    expect(await pathExists(repositoryPath)).toBe(true);
    expect(await pathExists(keptPath)).toBe(true);
  });

  test("removes legacy plain branch dir and cleans empty parent", async () => {
    const { workTreeRoot } = await setupRoots();
    const calls: Array<{ repositoryPath: string; workTreePath: string }> = [];
    const repositoryPath = join(workTreeRoot, "skipper");
    const workTreePath = await createLegacyWorktree(workTreeRoot, "skipper", "add-attach-main");

    await runRemove({ repository: "skipper", branch: "add-attach-main" }, makeGitService(calls));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.workTreePath).toBe(workTreePath);
    expect(await pathExists(workTreePath)).toBe(false);
    expect(await pathExists(repositoryPath)).toBe(false);
  });
});
