import { Effect, ServiceMap } from "effect";
import * as Shell from "../Shell";
import { Tmux } from "./TmuxService";

export const TmuxService = ServiceMap.make(Tmux, {
  attachSession: (sessionName: string, path: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const isInTmuxSession = !!process.env.TMUX;
        const { $, bool, exec } = yield* Shell.Shell;

        process.stderr.write(
          `[tmux:debug] sessionName=${sessionName} path=${path}\n` +
          `[tmux:debug] TMUX=${process.env.TMUX ?? "(unset)"} isInTmuxSession=${isInTmuxSession}\n` +
          `[tmux:debug] TERM=${process.env.TERM ?? "(unset)"} TERM_PROGRAM=${process.env.TERM_PROGRAM ?? "(unset)"}\n` +
          `[tmux:debug] TMUX_TMPDIR=${process.env.TMUX_TMPDIR ?? "(unset)"}\n`
        );

        const pgrep = yield* $({
          command: "pgrep tmux",
          errorMessage: "Failed to check tmux status",
        });
        const isTmuxRunning = !!pgrep;
        process.stderr.write(`[tmux:debug] pgrep tmux => "${pgrep.trim()}" isTmuxRunning=${isTmuxRunning}\n`);

        if (!isTmuxRunning) {
          return yield* new Shell.ShellError({
            message: "Tmux is not running. Please start tmux and try again.",
          });
        }

        const hasTmuxSession = yield* bool({
          command: `tmux has-session -t ${sessionName}`,
          errorMessage: `Failed to check tmux session '${sessionName}'`,
        }).pipe(Effect.map((result) => !!result));
        process.stderr.write(`[tmux:debug] has-session=${hasTmuxSession}\n`);

        if (!hasTmuxSession) {
          const newSessionCmd = `tmux new-session -d -s ${sessionName} -c ${path}`;
          process.stderr.write(`[tmux:debug] creating session: ${newSessionCmd}\n`);
          yield* $({
            command: newSessionCmd,
            errorMessage: `Failed to create tmux session '${sessionName}'`,
          });
        }

        const tmuxLs = yield* $({
          command: "tmux ls",
          errorMessage: "Failed to list tmux sessions",
        });
        process.stderr.write(`[tmux:debug] tmux ls =>\n${tmuxLs}\n`);

        if (isInTmuxSession) {
          const cmd = ["tmux", "switch-client", "-t", sessionName];
          process.stderr.write(`[tmux:debug] exec: ${cmd.join(" ")}\n`);
          yield* exec({
            command: cmd,
            errorMessage: `Failed to switch tmux session '${sessionName}'`,
          });
        } else {
          const cmd = ["tmux", "attach-session", "-t", sessionName];
          process.stderr.write(`[tmux:debug] exec: ${cmd.join(" ")}\n`);
          yield* exec({
            command: cmd,
            errorMessage: `Failed to attach to tmux session '${sessionName}'`,
          });
        }
      })
    ).pipe(
      Effect.tapError((e) =>
        Effect.sync(() =>
          process.stderr.write(
            `[tmux:error] attachSession failed: _tag=${e._tag} message=${e.message}\n` +
            `[tmux:error] cause=${e.cause instanceof Error ? e.cause.message : String(e.cause ?? "(none)")}\n`
          )
        )
      )
    ),
});
