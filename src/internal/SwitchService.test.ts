import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { BunServices } from "@effect/platform-bun";
import { listBranches, listRepositories, makeSessionName, resolveTargetPath } from "./SwitchService";

describe("SwitchService", () => {
  test("lists git repositories only", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-switch-repo-"));

    try {
      await mkdir(join(root, "demo", ".git"), { recursive: true });
      await mkdir(join(root, "notes"), { recursive: true });
      await writeFile(join(root, "README.md"), "x\n");

      const repositories = await Effect.runPromise(
        listRepositories(root).pipe(Effect.provide(BunServices.layer))
      );

      expect(repositories).toEqual(["demo"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("lists branches with main first", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-switch-branch-"));
    const repositoryRoot = join(root, "repositories");
    const workTreeRoot = join(root, "worktrees");

    try {
      await mkdir(join(repositoryRoot, "demo", ".git"), { recursive: true });
      await mkdir(join(workTreeRoot, "demo", "demo.feature-a"), {
        recursive: true,
      });
      await mkdir(join(workTreeRoot, "demo", "demo.feat", "test"), {
        recursive: true,
      });
      await mkdir(join(workTreeRoot, "demo", "bugfix"), { recursive: true });
      await writeFile(join(workTreeRoot, "demo", "demo.feature-a", ".git"), "x\n");
      await writeFile(
        join(workTreeRoot, "demo", "demo.feat", "test", ".git"),
        "x\n"
      );
      await writeFile(join(workTreeRoot, "demo", "bugfix", ".git"), "x\n");

      const branches = await Effect.runPromise(
        listBranches("demo", { repositoryRoot, workTreeRoot }).pipe(
          Effect.provide(BunServices.layer)
        )
      );

      expect(branches).toEqual(["main", "bugfix", "feat/test", "feature-a"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("resolveTargetPath uses repo root for main", () => {
    expect(String(resolveTargetPath("demo", "main"))).toContain("/github/demo");
    expect(String(resolveTargetPath("demo", "feature-a"))).toContain(
      "/skipper/worktree/demo/demo.feature-a"
    );
  });

  test("makeSessionName sanitizes values", () => {
    expect(makeSessionName("team/repo", "feat/test branch")).toBe(
      "team-repo-feat-test-branch"
    );
  });

  test("listRepositories returns empty when root missing", async () => {
    const repositories = await Effect.runPromise(
      listRepositories(join(tmpdir(), "skipper-switch-missing-root")).pipe(
        Effect.provide(BunServices.layer)
      )
    );

    expect(repositories).toEqual([]);
  });
});
