import { rm } from "node:fs/promises";
import { Effect, ServiceMap } from "effect";
import type { GitRepository } from "@/domain/GitRepository";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";
import { readGitPickerData, readPickerOptions } from "./picker/fs";
import { pickGitRepository, pickSingleOption } from "./picker/OpenTuiPicker";

type SearchInDirectoryOptions = {
  readonly throwOnNotFound?: boolean;
  readonly additionalOptions?: readonly string[];
};

export const FuzzyFindService = ServiceMap.Service<{
  searchInDirectory: (
    directory: string,
    options?: SearchInDirectoryOptions
  ) => Effect.Effect<string, never, never>;
  searchGitRepository: () => Effect.Effect<GitRepository | null, never, never>;
}>("FuzzyFindService");

export const FuzzyFindServiceImpl = ServiceMap.make(FuzzyFindService, {
  searchInDirectory: (directory, options) =>
    Effect.gen(function* () {
      const throwOnNotFound = options?.throwOnNotFound ?? false;
      const additionalOptions = options?.additionalOptions ?? [];

      yield* Effect.logDebug("Starting fuzzy search").pipe(
        Effect.annotateLogs({ directory, throwOnNotFound, additionalOptions })
      );

      const result = yield* Effect.promise(() =>
        readPickerOptions(directory, additionalOptions).then((entries) =>
          pickSingleOption({
            title: directory,
            options: entries,
          })
        )
      ).pipe(
        Effect.tapError((error) =>
          Effect.logError("Interactive picker failed", error).pipe(
            Effect.annotateLogs({ directory })
          )
        ),
        Effect.catch(() => Effect.succeed(""))
      );

      yield* Effect.logDebug("Fuzzy search finished").pipe(
        Effect.annotateLogs({
          directory,
          throwOnNotFound,
          result: result.length > 0 ? result : "<empty>",
        })
      );

      if (throwOnNotFound && result.length === 0) {
        throw new Error(`No fuzzy match found in '${directory}'`);
      }

      return result;
    }),
  searchGitRepository: () =>
    Effect.gen(function* () {
      const result = yield* Effect.promise(() =>
        readGitPickerData().then((data) =>
          pickGitRepository(data, {
            removeWorktree: async (gitRepository: GitRepository) => {
              if (gitRepository.branch === "main") {
                return;
              }

              const repositoryPath = RepositoryPath.make(
                gitRepository.repository
              );
              const worktreePath = WorkTreePath.make(gitRepository);

              await Bun.$`git -C ${repositoryPath} worktree remove --force ${worktreePath}`.nothrow();
              await rm(worktreePath, { recursive: true, force: true });
            },
          })
        )
      ).pipe(
        Effect.tapError((error) =>
          Effect.logError("Git picker failed", error).pipe(
            Effect.annotateLogs({ scope: "repository-worktree" })
          )
        ),
        Effect.catch(() => Effect.succeed(null))
      );

      return result;
    }),
});
