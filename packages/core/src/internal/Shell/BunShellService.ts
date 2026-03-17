import { Effect, ServiceMap } from "effect";
import { ShellError, ShellService } from "./ShellService";

export const BunShellService = ServiceMap.make(ShellService, {
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
        const result = Bun.spawnSync({
          cmd: command,
          stdin: 0,
          stdout: 1,
          stderr: 2,
          env: process.env,
        });
        if (!result.success) {
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
  run: ({ command, cwd, env, errorMessage }) =>
    Effect.try({
      try: () => {
        const result = Bun.spawnSync({
          cmd: ["/bin/bash", "-lc", command],
          cwd,
          stdin: 0,
          stdout: 1,
          stderr: 2,
          env: {
            ...process.env,
            ...env,
          },
        });

        return result.exitCode;
      },
      catch: (cause) =>
        new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        }),
    }),
});
