import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPickerOptions, readWorktreeNames } from "./fs";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";

describe("picker fs", () => {
  test("merges additional options and sorts entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skipper-picker-fs-"));

    try {
      await mkdir(join(directory, "beta"));
      await mkdir(join(directory, "alpha"));

      const result = await readPickerOptions(directory, ["main"]);

      expect(result).toEqual(["main", "alpha", "beta"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("returns additional options when directory is missing", async () => {
    const result = await readPickerOptions("/missing/skipper-picker", ["main"]);

    expect(result).toEqual(["main"]);
  });

  test("sorts entries by last edited desc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skipper-picker-fs-"));

    try {
      const older = join(directory, "older");
      const newer = join(directory, "newer");
      await mkdir(older);
      await mkdir(newer);
      await utimes(older, new Date("2024-01-01T00:00:00.000Z"), new Date("2024-01-01T00:00:00.000Z"));
      await utimes(newer, new Date("2025-01-01T00:00:00.000Z"), new Date("2025-01-01T00:00:00.000Z"));

      const result = await readPickerOptions(directory);

      expect(result).toEqual(["newer", "older"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("worktrees keep main and sort by last edited", async () => {
    const repoName = `skipper-picker-${Date.now()}`;
    const repositoryPath = String(RepositoryPath.make(repoName));
    const worktreeRoot = String(
      WorkTreePath.makeRepositoryPath({ repository: repoName, branch: "main" })
    );
    const newer = join(worktreeRoot, "feature-new");
    const older = join(worktreeRoot, "feature-old");

    try {
      await mkdir(repositoryPath, { recursive: true });
      await mkdir(newer, { recursive: true });
      await mkdir(older, { recursive: true });
      await utimes(repositoryPath, new Date("2024-06-01T00:00:00.000Z"), new Date("2024-06-01T00:00:00.000Z"));
      await utimes(older, new Date("2024-01-01T00:00:00.000Z"), new Date("2024-01-01T00:00:00.000Z"));
      await utimes(newer, new Date("2025-01-01T00:00:00.000Z"), new Date("2025-01-01T00:00:00.000Z"));

      const result = await readWorktreeNames(repoName);

      expect(result).toEqual(["feature-new", "main", "feature-old"]);
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
      await rm(worktreeRoot, { recursive: true, force: true });
    }
  });
});
