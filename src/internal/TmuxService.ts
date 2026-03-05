import { Effect, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

export const TmuxService = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, PlatformError, ChildProcessSpawner>;
}>("TmuxService");

export const TmuxServiceImpl = ServiceMap.make(TmuxService, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = process.env.TMUX !== undefined;

        yield* Effect.logInfo("Running tmux command");

        const hasSessionHandle = yield* ChildProcess.make(
          {}
        )`tmux has-session -t ${sessionName}`;
        const hasSessionExitCode = Number(yield* hasSessionHandle.exitCode);

        if (hasSessionExitCode !== 0) {
          const createSessionHandle = yield* ChildProcess.make(
            {}
          )`tmux new-session -ds ${sessionName} -c ${path}`;
          yield* createSessionHandle.exitCode;
        }

        if (isInTmuxSession) {
          const switchClientHandle = yield* ChildProcess.make(
            {}
          )`tmux switch-client -t ${sessionName}`;
          yield* switchClientHandle.exitCode;

          return;
        }

        const attachSessionHandle = yield* ChildProcess.make(
          {}
        )`tmux attach-session -t ${sessionName}`;
        yield* attachSessionHandle.exitCode;
      })
    ),
});
