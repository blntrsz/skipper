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
        process.stderr.write(`[exec:debug] Bun.spawnSync: ${command.join(" ")}\n`);
        process.stderr.write(
          `[exec:debug] isTTY=${process.stdin.isTTY} pid=${process.pid}\n`
        );
        const result = Bun.spawnSync({
          cmd: command,
          stdin: 0,
          stdout: 1,
          stderr: 2,
          env: process.env,
        });
        process.stderr.write(
          `[exec:debug] status=${result.exitCode} signal=${
            result.signalCode ?? "(none)"
          } success=${result.success}\n`
        );
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
});
