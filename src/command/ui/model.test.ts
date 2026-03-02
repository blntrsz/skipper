import { expect, test } from "bun:test";
import { resolveSelectedWorktreeKey, type UiWorktreeState } from "./model.js";

test("resolveSelectedWorktreeKey keeps valid selected key", () => {
  const worktrees: UiWorktreeState[] = [
    {
      key: "repo/feature",
      repo: "repo",
      worktree: "feature",
      path: "/tmp/repo/feature",
      sessionName: "repo-feature",
      sessionRunning: false,
    },
    {
      key: "repo/fix",
      repo: "repo",
      worktree: "fix",
      path: "/tmp/repo/fix",
      sessionName: "repo-fix",
      sessionRunning: true,
    },
  ];
  const selected = resolveSelectedWorktreeKey(worktrees, "repo/fix");
  expect(selected).toBe("repo/fix");
});

test("resolveSelectedWorktreeKey falls back to first entry", () => {
  const worktrees: UiWorktreeState[] = [
    {
      key: "repo/feature",
      repo: "repo",
      worktree: "feature",
      path: "/tmp/repo/feature",
      sessionName: "repo-feature",
      sessionRunning: false,
    },
  ];
  const selected = resolveSelectedWorktreeKey(worktrees, "repo/missing");
  expect(selected).toBe("repo/feature");
});
