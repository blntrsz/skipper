import { expect, test } from "bun:test";
import {
  buildSessionName,
  buildWorktreePath,
  createSkipperPaths,
  resolveWorktreeName,
} from "./service.js";

test("resolveWorktreeName prefers selected row", () => {
  const value = resolveWorktreeName("feature\nrelease");
  expect(value).toBe("release");
});

test("resolveWorktreeName falls back to query", () => {
  const value = resolveWorktreeName("feature\n[new]");
  expect(value).toBe("feature");
});

test("buildSessionName formats repo and worktree", () => {
  expect(buildSessionName("repo", "feature")).toBe("repo-feature");
});

test("buildWorktreePath uses configured base path", () => {
  const paths = createSkipperPaths();
  const value = buildWorktreePath(paths, "repo", "feature");
  expect(value.endsWith("/.local/share/skipper/worktree/repo/feature")).toBe(true);
});
