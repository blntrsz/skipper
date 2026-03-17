import { BunFileSystem } from "@effect/platform-bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Option, Path, Stdio, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  type PickerService as PickerServiceShape,
  PickerService,
} from "../internal/Picker/PickerService";
import { type ShellService as ShellServiceShape, ShellService } from "../internal/Shell";
import { RunService } from "./RunService";
import { TerminalRunService } from "./TerminalRunService";

const originalRepositoryRoot = process.env.SKIPPER_REPOSITORY_ROOT;
const originalWorkTreeRoot = process.env.SKIPPER_WORKTREE_ROOT;
const stdinTTY = process.stdin.isTTY;
const stdoutTTY = process.stdout.isTTY;
const originalCI = process.env.CI;

const setTTY = (value: boolean) => {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value });
};

const setupRoots = async () => {
  const root = await mkdtemp(join(tmpdir(), "skipper-run-service-"));
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

const runService = (
  input: {
    repository: Option.Option<string>;
    branch: Option.Option<string>;
    command: Option.Option<string>;
  },
  picker: PickerServiceShape,
  shell: ShellServiceShape,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* RunService;
      return yield* service.run(input);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          BunFileSystem.layer,
          Path.layer,
          Stdio.layerTest({}),
          Layer.succeed(
            Terminal.Terminal,
            Terminal.make({
              columns: Effect.succeed(80),
              readInput: Effect.die("not used"),
              readLine: Effect.die("not used"),
              display: () => Effect.void,
            }),
          ),
          Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() => Effect.die("not used")),
          ),
          Layer.effectServices(Effect.succeed(TerminalRunService)),
          Layer.succeed(PickerService, picker),
          Layer.succeed(ShellService, shell),
        ),
      ),
    ),
  );

describe("TerminalRunService", () => {
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

  test("picks repository then branch and runs in selected worktree", async () => {
    const { repositoryRoot, workTreeRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    await createRepository(repositoryRoot, "repo-b");
    await createWorktree(workTreeRoot, "repo-a", "feature");

    const picks: Array<{ message: string; options: string[] }> = [];
    const picker: PickerServiceShape = {
      pick: ({ message, options }) => {
        picks.push({ message, options });
        return Effect.succeed(message === "Repository" ? "repo-a" : "feature");
      },
    };
    const calls: Array<{ command: string; cwd?: string }> = [];
    const shell: ShellServiceShape = {
      bool: () => Effect.die("not used"),
      $: () => Effect.die("not used"),
      exec: () => Effect.die("not used"),
      run: ({ command, cwd }) =>
        Effect.sync(() => {
          calls.push({ command, cwd });
          return 0;
        }),
    };

    const result = await runService(
      {
        repository: Option.none(),
        branch: Option.none(),
        command: Option.some("pwd"),
      },
      picker,
      shell,
    );

    expect(result).toBe(0);
    expect(picks).toEqual([
      { message: "Repository", options: ["repo-a", "repo-b"] },
      { message: "Branch", options: ["main", "feature"] },
    ]);
    expect(calls).toEqual([
      { command: "pwd", cwd: join(workTreeRoot, "repo-a", "repo-a.feature") },
    ]);
  });

  test("uses repository root for main", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");

    const picker: PickerServiceShape = {
      pick: () => Effect.die("not used"),
    };
    const calls: Array<{ command: string; cwd?: string }> = [];
    const shell: ShellServiceShape = {
      bool: () => Effect.die("not used"),
      $: () => Effect.die("not used"),
      exec: () => Effect.die("not used"),
      run: ({ command, cwd }) =>
        Effect.sync(() => {
          calls.push({ command, cwd });
          return 0;
        }),
    };

    await runService(
      {
        repository: Option.some("repo-a"),
        branch: Option.some("main"),
        command: Option.some("pwd"),
      },
      picker,
      shell,
    );

    expect(calls).toEqual([{ command: "pwd", cwd: join(repositoryRoot, "repo-a") }]);
  });

  test("fails when worktree branch is missing", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");

    const picker: PickerServiceShape = {
      pick: () => Effect.die("not used"),
    };
    const shell: ShellServiceShape = {
      bool: () => Effect.die("not used"),
      $: () => Effect.die("not used"),
      exec: () => Effect.die("not used"),
      run: () => Effect.die("not used"),
    };

    await expect(
      runService(
        {
          repository: Option.some("repo-a"),
          branch: Option.some("feature"),
          command: Option.some("pwd"),
        },
        picker,
        shell,
      ),
    ).rejects.toMatchObject({
      message: "Branch 'feature' not found for 'repo-a'",
    });
  });

  test("fails without tty when any input is missing", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");
    setTTY(false);

    const picker: PickerServiceShape = {
      pick: () => Effect.die("not used"),
    };
    const shell: ShellServiceShape = {
      bool: () => Effect.die("not used"),
      $: () => Effect.die("not used"),
      exec: () => Effect.die("not used"),
      run: () => Effect.die("not used"),
    };

    await expect(
      runService(
        {
          repository: Option.some("repo-a"),
          branch: Option.some("main"),
          command: Option.none(),
        },
        picker,
        shell,
      ),
    ).rejects.toMatchObject({
      message: "sandbox run requires a TTY when --repository, --branch, or --command is missing",
    });
  });

  test("returns child exit code unchanged", async () => {
    const { repositoryRoot } = await setupRoots();
    await createRepository(repositoryRoot, "repo-a");

    const picker: PickerServiceShape = {
      pick: () => Effect.die("not used"),
    };
    const shell: ShellServiceShape = {
      bool: () => Effect.die("not used"),
      $: () => Effect.die("not used"),
      exec: () => Effect.die("not used"),
      run: () => Effect.succeed(7),
    };

    const result = await runService(
      {
        repository: Option.some("repo-a"),
        branch: Option.some("main"),
        command: Option.some("exit 7"),
      },
      picker,
      shell,
    );

    expect(result).toBe(7);
  });
});
