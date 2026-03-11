import { Effect, ServiceMap } from "effect";
import { Shell, ShellError } from "./Service";

export const BunShell = ServiceMap.make(Shell, {
  bool: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () =>
        Bun.$`${{ raw: command }}`
          .env(process.env)
          .nothrow()
          .then((result) => result.exitCode === 0),
      catch: (cause) =>
        new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        }),
    });
  },
  $: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () => Bun.$`${{ raw: command }}`.env(process.env).text(),
      catch: (cause) =>
        new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        }),
    });
  },
});
