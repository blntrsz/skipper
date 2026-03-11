import { Effect, ServiceMap } from "effect";
import * as Shell from "../Shell";
import { Tmux } from "./TmuxService";

export const TmuxService = ServiceMap.make(Tmux, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;
        const { $, bool, exec } = yield* Shell.Shell;

        const isTmuxRunning = yield* $({
          command: "pgrep tmux",
          errorMessage: "Failed to check tmux status",
        }).pipe(Effect.map((result) => !!result));

        if (!isTmuxRunning) {
          return yield* new Shell.ShellError({
            message: "Tmux is not running. Please start tmux and try again.",
          });
        }

        const hasTmuxSession = yield* bool({
          command: `tmux has-session -t ${sessionName}`,
          errorMessage: `Failed to check tmux session '${sessionName}'`,
        }).pipe(Effect.map((result) => !!result));

        if (!hasTmuxSession) {
          yield* $({
            command: `tmux new-session -d -s ${sessionName} -c ${path}`,
            errorMessage: `Failed to create tmux session '${sessionName}'`,
          });
        }

        if (isInTmuxSession) {
          yield* exec({
            command: ["tmux", "switch-client", "-t", sessionName],
            errorMessage: `Failed to switch tmux session '${sessionName}'`,
          });
        } else {
          yield* exec({
            command: ["tmux", "attach-session", "-t", sessionName],
            errorMessage: `Failed to attach to tmux session '${sessionName}'`,
          });
        }
      })
    ),
});
