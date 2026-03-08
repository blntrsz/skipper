import { Effect, ServiceMap, Stream } from "effect";
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
        const isInTmuxSession = !!process.env.TMUX;
        const tmuxOptions = { detached: false };

        if (isInTmuxSession) {
          const hasSessionHandle = yield* ChildProcess.make(
            tmuxOptions
          )`tmux has-session -t ${sessionName}`;
          const hasSessionExitCode = Number(yield* hasSessionHandle.exitCode);

          if (hasSessionExitCode !== 0) {
            const createSessionHandle = yield* ChildProcess.make(
              tmuxOptions
            )`tmux new-session -ds ${sessionName} -c ${path}`;
            yield* createSessionHandle.exitCode;
          }

          const switchClientHandle = yield* ChildProcess.make(
            {
              ...tmuxOptions,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            }
          )`tmux switch-client -t ${sessionName}`;
          yield* switchClientHandle.exitCode;

          return;
        }

        const attachSessionHandle = yield* ChildProcess.make({
          cwd: path,
          ...tmuxOptions,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })`tmux new-session -As ${sessionName} -c ${path}`;
        yield* attachSessionHandle.exitCode;
      })
    ),
});
