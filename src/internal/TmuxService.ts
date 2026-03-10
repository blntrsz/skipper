import { Effect, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { getErrorMessage } from "@/internal/ServiceError";
import { TmuxError } from "@/internal/TmuxError";

type TmuxCommandOptions = {
  readonly cwd?: string;
  readonly stdin?: "inherit" | "ignore";
  readonly stdout?: "inherit" | "pipe";
  readonly stderr?: "inherit" | "pipe";
};

type TmuxRunner = (
  args: ReadonlyArray<string>,
  options: TmuxCommandOptions,
  failureMessage: string
) => Effect.Effect<void, TmuxError, never>;

const runTmux: TmuxRunner = (args, options, failureMessage) =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["tmux", ...args], {
        ...options,
        env: process.env,
      });
      const exitCode = await proc.exited;

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
        {
          cwd: path,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        },
        `Failed to attach tmux session '${sessionName}'`
      );

export const TmuxService = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, PlatformError | TmuxError, ChildProcessSpawner>;
}>("TmuxService");

export const TmuxServiceImpl = ServiceMap.make(TmuxService, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;
        const tmuxOptions = {
          detached: false,
        };
        const interactiveTmuxOptions = {
          cwd: path,
          ...tmuxOptions,
          stdin: "inherit" as const,
          stdout: "inherit" as const,
          stderr: "inherit" as const,
        };

        const tmuxRunningHandler = yield* ChildProcess.make`pgrep tmux`;
        const isTmuxRunning = Number(yield* tmuxRunningHandler.exitCode) === 0;

        if (!isInTmuxSession && !isTmuxRunning) {
          const createSessionHandle = yield* ChildProcess.make(
            interactiveTmuxOptions
          )`tmux new-session -s ${sessionName} -c ${path}`;
          yield* createSessionHandle.exitCode;
          return;
        }

        const hasSessionHandle = yield* ChildProcess.make(
          tmuxOptions
        )`tmux has-session -t ${sessionName}`;
        const hasTmuxSession = Number(yield* hasSessionHandle.exitCode) === 0;

        if (!hasTmuxSession) {
          const createSessionHandle = yield* ChildProcess.make(
            tmuxOptions
          )`tmux new-session -ds ${sessionName} -c ${path}`;
          yield* createSessionHandle.exitCode;
        }

        yield* connectToTmuxSession(runTmux, sessionName, path, isInTmuxSession);
      })
    ),
});
