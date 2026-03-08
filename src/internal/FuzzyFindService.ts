import { Effect, ServiceMap } from "effect";
import { BunServices } from "@effect/platform-bun";
import type { GitRepository } from "@/domain/GitRepository";
import * as WorkTreeService from "@/Sandbox/adapter/WorkTreeService";
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
              await Effect.runPromise(
                WorkTreeService.remove(gitRepository).pipe(
                  Effect.provide(BunServices.layer)
                )
              );
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
