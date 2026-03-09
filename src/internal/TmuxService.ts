import { Effect, ServiceMap } from "effect";
import type { UnknownError } from "effect/Cause";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

export const TmuxService = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, PlatformError | UnknownError, ChildProcessSpawner>;
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

        if (isInTmuxSession) {
          yield* Effect.tryPromise(
            () => Bun.$`tmux switch-client -t ${sessionName}`
          );
        } else {
          yield* Effect.tryPromise(() => Bun.$`tmux a -t ${sessionName}`);
        }
      })
    ),
});
