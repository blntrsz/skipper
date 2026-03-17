import { Effect, ServiceMap } from "effect";
import * as Shell from "../Shell";
import { TmuxService } from "./TmuxService";

export const ShellTmuxService = ServiceMap.make(TmuxService, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;
        const { $, bool, exec } = yield* Shell.ShellService;

        const hasTmuxInstalled = yield* bool({
          command: "command -v tmux >/dev/null 2>&1",
          errorMessage: "Failed to check tmux installation",
        });

        if (!hasTmuxInstalled) {
          return yield* new Shell.ShellError({
            message: "tmux is required for sandbox switch. Install tmux and retry.",
          });
        }

        const hasTmuxSession = yield* bool({
          command: `tmux has-session -t ${sessionName}`,
          errorMessage: `Failed to check tmux session '${sessionName}'`,
        }).pipe(Effect.map((result) => !!result));

        if (!hasTmuxSession) {
          const newSessionCmd = `tmux new-session -d -s ${sessionName} -c ${path}`;
          yield* $({
            command: newSessionCmd,
            errorMessage: `Failed to create tmux session '${sessionName}'`,
          });
        }

        const canSwitchClient =
          isInTmuxSession &&
          (yield* bool({
            command: "tmux display-message -p '#S' >/dev/null 2>&1",
            errorMessage: "Failed to verify tmux client context",
          }));

        if (canSwitchClient) {
          const cmd = ["tmux", "switch-client", "-t", sessionName];
          yield* exec({
            command: cmd,
            errorMessage: `Failed to switch tmux session '${sessionName}'`,
          });
        } else {
          const cmd = ["env", "-u", "TMUX", "tmux", "attach-session", "-t", sessionName];
          yield* exec({
            command: cmd,
            errorMessage: `Failed to attach to tmux session '${sessionName}'`,
          });
        }
      }),
    ).pipe(
      Effect.tapError((e) =>
        Effect.sync(() =>
          process.stderr.write(
            `[tmux:error] attachSession failed: _tag=${e._tag} message=${e.message}\n` +
              `[tmux:error] cause=${
                e.cause instanceof Error ? e.cause.message : String(e.cause ?? "(none)")
              }\n`,
          ),
        ),
      ),
    ),
});
