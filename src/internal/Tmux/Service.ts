import { Config, Effect, ServiceMap } from "effect";
import * as Shell from "../Shell";
import type { ConfigError } from "effect/Config";

export const TmuxService = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<
    void,
    Shell.ShellError | ConfigError,
    typeof Shell.Shell.Service
  >;
}>("TmuxService");

export const tmuxConfig = Config.make((provider) =>
  Effect.all({
    tmux: Config.string("TMUX").parse(provider),
  })
);

export const TmuxServiceImpl = ServiceMap.make(TmuxService, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;
        const { $, bool } = yield* Shell.Shell;

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
          yield* $({
            command: `tmux switch-client -t ${sessionName}`,
            errorMessage: `Failed to switch tmux session '${sessionName}'`,
          });
        } else {
          yield* $({
            command: `tmux attach-session -t ${sessionName}`,
            errorMessage: `Failed to attach to tmux session '${sessionName}'`,
          });
        }
      })
    ),
});
