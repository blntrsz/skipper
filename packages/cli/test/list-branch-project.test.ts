/** @effect-diagnostics strictEffectProvide:off */
import {
  listBranchProject,
  WorkTreeFileSystemServiceLayer,
  WorkTreeWorkspaceRegistryServiceLayer,
} from "@skippercorp/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";

describe("listBranchProject", () => {
  it.effect("creates missing repository worktree directory", () =>
    Effect.gen(function* () {
      const repositoryDirectory = join(homedir(), ".local/share/skipper/worktree", "chronops");
      const created: Array<{ path: string; recursive: boolean | undefined }> = [];

      const result = yield* listBranchProject("chronops").pipe(
        Effect.provide(WorkTreeWorkspaceRegistryServiceLayer),
        Effect.provide(WorkTreeFileSystemServiceLayer),
        Effect.provide(Path.layer),
        Effect.provide(
          FileSystem.layerNoop({
            exists: (path) => Effect.succeed(path !== repositoryDirectory),
            makeDirectory: (path, options) =>
              Effect.sync(() => {
                created.push({ path, recursive: options?.recursive });
              }),
            readDirectory: (path) => {
              expect(path).toBe(repositoryDirectory);
              return Effect.succeed([]);
            },
          }),
        ),
      );

      expect(result).toEqual([]);
      expect(created).toEqual([{ path: repositoryDirectory, recursive: true }]);
    }),
  );
});
