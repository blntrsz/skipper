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
  exec: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(command, {
          env: process.env,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          throw new ShellError({
            message: errorMessage,
          });
        }
      },
      catch: (cause) => {
        if (cause instanceof ShellError) return cause;
        return new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        });
      },
    });
  },
});
