import { spawnSync } from "child_process";
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
    return Effect.try({
      try: () => {
        process.stderr.write(`[exec:debug] spawnSync: ${command.join(" ")}\n`);
        const result = spawnSync(command[0]!, command.slice(1), {
          shell: true,
          env: process.env,
          stdio: "inherit",
        });
        process.stderr.write(
          `[exec:debug] status=${result.status} signal=${
            result.signal ?? "(none)"
          } error=${result.error?.message ?? "(none)"}\n`
        );
        if (result.status !== 0) {
          throw new ShellError({ message: errorMessage });
        }
      },
      catch: (cause) => {
        console.log(cause);
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
