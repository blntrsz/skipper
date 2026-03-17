import { Effect, ServiceMap } from "effect";
import { ShellError, ShellService } from "./ShellService";

const unknownShellErrorMessage = "An unknown error occurred while executing the shell command.";

const makeShellError = (cause: unknown, errorMessage?: string) =>
  new ShellError({
    message: errorMessage ?? (cause as Error)?.message ?? unknownShellErrorMessage,
    cause,
  });

export const BunShellService = ServiceMap.make(ShellService, {
  bool: ({ command, errorMessage }) => {
    return Effect.try({
      try: () =>
        Bun.spawnSync({
          cmd: ["/bin/bash", "-lc", command],
          stdin: 0,
          stdout: "ignore",
          stderr: "ignore",
          env: process.env,
        }).exitCode === 0,
      catch: (cause) => makeShellError(cause, errorMessage),
    });
  },
  $: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () => Bun.$`${{ raw: command }}`.env(process.env).text(),
      catch: (cause) => makeShellError(cause, errorMessage),
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
        return makeShellError(cause, errorMessage);
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
      catch: (cause) => makeShellError(cause, errorMessage),
    }),
});
