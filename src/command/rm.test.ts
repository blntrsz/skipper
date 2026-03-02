import { expect, test } from "bun:test";
import { formatRemoveGitWorktreeError } from "./rm.js";

test("rm uses forced git worktree remove", async () => {
  const source = await Bun.file(new URL("./rm.ts", import.meta.url)).text();
  expect(source).toContain("worktree remove --force");
});

test("formatRemoveGitWorktreeError prefers stderr", () => {
  expect(formatRemoveGitWorktreeError(" fatal: dirty worktree \n", 128)).toBe(
    "fatal: dirty worktree",
  );
});

test("formatRemoveGitWorktreeError falls back to exit code", () => {
  expect(formatRemoveGitWorktreeError("", 17)).toBe(
    "git worktree remove failed with code 17",
  );
});
