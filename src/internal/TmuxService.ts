import { Effect, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { getErrorMessage } from "@/internal/ServiceError";
import { TmuxError } from "@/internal/TmuxError";

type TmuxCommandOptions = {
  readonly cwd?: string;
  readonly quiet?: boolean;
};

type TmuxRunner = (
  args: ReadonlyArray<string>,
  options: TmuxCommandOptions,
  failureMessage: string
) => Effect.Effect<void, TmuxError, never>;

const runTmux: TmuxRunner = (args, options, failureMessage) =>
  Effect.tryPromise({
    try: async () => {
      let command = Bun.$`${["tmux", ...args]}`.env(process.env).nothrow();

      if (options.cwd !== undefined) {
        command = command.cwd(options.cwd);
      }

      if (options.quiet === true) {
        command = command.quiet();
      }

      const exitCode = (await command).exitCode;

      if (exitCode !== 0) {
        throw new Error(`tmux ${args.join(" ")} failed with exit code ${exitCode}`);
      }
    },
    catch: (cause) =>
      new TmuxError({
        message: getErrorMessage(cause, failureMessage),
        cause,
      }),
  });

export const connectToTmuxSession = (
  runner: TmuxRunner,
  sessionName: string,
  path: string,
  isInTmuxSession: boolean
) =>
  isInTmuxSession
    ? runner(
        ["switch-client", "-t", sessionName],
        { cwd: path },
        `Failed to switch tmux session '${sessionName}'`
      )
    : runner(
        ["attach-session", "-t", sessionName],
        { cwd: path },
        `Failed to attach tmux session '${sessionName}'`
      );

export const TmuxService = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, TmuxError, ChildProcessSpawner>;
}>("TmuxService");

export const TmuxServiceImpl = ServiceMap.make(TmuxService, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;

        const tmuxRunning = yield* Effect.tryPromise({
          try: () => Bun.$`${["pgrep", "tmux"]}`.quiet().nothrow(),
          catch: (cause) =>
            new TmuxError({
              message: getErrorMessage(cause, "Failed to check tmux status"),
              cause,
            }),
        });
        const isTmuxRunning = tmuxRunning.exitCode === 0;

        if (!isInTmuxSession && !isTmuxRunning) {
          yield* runTmux(
            ["new-session", "-s", sessionName, "-c", path],
            { cwd: path },
            `Failed to create tmux session '${sessionName}'`
          );
          return;
        }

        const hasSession = yield* Effect.tryPromise({
          try: () => Bun.$`${["tmux", "has-session", "-t", sessionName]}`.quiet().nothrow(),
          catch: (cause) =>
            new TmuxError({
              message: getErrorMessage(cause, `Failed to check tmux session '${sessionName}'`),
              cause,
            }),
        });
        const hasTmuxSession = hasSession.exitCode === 0;

        if (!hasTmuxSession) {
          yield* runTmux(
            ["new-session", "-ds", sessionName, "-c", path],
            { cwd: path },
            `Failed to create tmux session '${sessionName}'`
          );
        }

        yield* connectToTmuxSession(runTmux, sessionName, path, isInTmuxSession);
      })
    ),
});
