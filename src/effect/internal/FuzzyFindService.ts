import { Effect, ServiceMap } from "effect";

const DIRECTORY_GLOB = new Bun.Glob("*");
const FZF_NO_MATCH_EXIT_CODE = 1;
const FZF_CANCELLED_EXIT_CODE = 130;

type SearchInDirectoryOptions = {
  readonly throwOnNotFound?: boolean;
};

const resolveSelectionOrQuery = (output: string): string => {
  const [query = "", selection = ""] = output.trim().split("\n");
  return selection || query;
};

const searchWithFzf = async (directory: string): Promise<string> => {
  const entries = await Array.fromAsync(
    DIRECTORY_GLOB.scan({ cwd: directory, onlyFiles: false })
  );
  const input = entries
    .filter((entry) => entry.trim().length > 0)
    .sort((a, b) => a.localeCompare(b))
    .join("\n");

  const result = await Bun.$`echo ${input} | fzf --print-query`.nothrow();

  if (result.exitCode === 0 || result.exitCode === FZF_NO_MATCH_EXIT_CODE) {
    return resolveSelectionOrQuery(result.stdout.toString());
  }

  if (result.exitCode === FZF_CANCELLED_EXIT_CODE) {
    return "";
  }

  return "";
};

export const FuzzyFindService = ServiceMap.Service<{
  searchInDirectory: (
    directory: string,
    options?: SearchInDirectoryOptions
  ) => Effect.Effect<string, never, never>;
}>("FuzzyFindService");

export const FuzzyFindServiceImpl = ServiceMap.make(FuzzyFindService, {
  searchInDirectory: (directory, options) =>
    Effect.gen(function* () {
      const throwOnNotFound = options?.throwOnNotFound ?? false;

      yield* Effect.logDebug("Starting fuzzy search").pipe(
        Effect.annotateLogs({ directory, throwOnNotFound })
      );

      const result = yield* Effect.promise(() => searchWithFzf(directory)).pipe(
        Effect.tapError((error) =>
          Effect.logError("Fuzzy search failed", error).pipe(
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
});
