import {
  Config,
  Effect,
  Layer,
  Option,
  PlatformError,
  Schema,
  Scope,
  ServiceMap,
  Stream,
} from "effect";
import { ChildProcess } from "effect/unstable/process";
import type { ProjectModel } from "../workspace";
import { ChildProcessSpawner } from "effect/unstable/process";
import { InteractiveCommandService } from "./adapter/interactive-command.service";

class TmuxError extends Schema.TaggedErrorClass<TmuxError>()("TmuxError", {
  message: Schema.String,
  stderr: Schema.optional(Schema.String),
}) {
  toReadable() {
    const hasStderr = Boolean(this.stderr);
    const reason = hasStderr ? ` Reason: ${this.stderr ?? "Unknown error"}` : "";
    return `[TmuxError]: ${this.message}.` + reason;
  }
}

export class TmuxService extends ServiceMap.Service<
  TmuxService,
  {
    ensureInstalled: () => Effect.Effect<
      undefined,
      PlatformError.PlatformError | TmuxError,
      Scope.Scope
    >;
    hasSession: (
      sessionName: string,
    ) => Effect.Effect<boolean, PlatformError.PlatformError | TmuxError, Scope.Scope>;
    isInSession: () => Effect.Effect<boolean, PlatformError.PlatformError | TmuxError, Scope.Scope>;
    createSession: (
      sessionName: string,
      path: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, Scope.Scope>;
    switchClient: (
      sessionName: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, never>;
    attachSession: (
      sessionName: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, never>;
    sessionName: (project: ProjectModel) => string;
    killSession: (
      sessionName: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, Scope.Scope>;
  }
>()("@skippercorp/core/common/tmux/TmuxService") {}

export const TmuxServiceImpl = Layer.effect(
  TmuxService,
  Effect.gen(function* () {
    const { spawn } = yield* ChildProcessSpawner.ChildProcessSpawner;
    const { run } = yield* InteractiveCommandService;

    /**
     * Checks if tmux is installed by running `which tmux` command. If tmux is not found, it throws a TmuxError with a message indicating that tmux is required for sandbox switch.
     */
    const ensureInstalled = Effect.fn("tmux.isInstalled")(function* () {
      const process = yield* spawn(ChildProcess.make`which tmux`);

      const isMissing = (yield* process.exitCode) === 1;

      if (isMissing) {
        return yield* new TmuxError({
          message: "tmux is required for sandbox switch. Install tmux and retry.",
        });
      }
    });

    /**
     * Checks if a tmux session with the given name exists by running `tmux has-session -t <sessionName>` command.
     */
    const hasSession = Effect.fn("tmux.hasSession")(function* (sessionName: string) {
      const process = yield* spawn(ChildProcess.make`tmux has-session -t ${sessionName}`);

      return (yield* process.exitCode) === 0;
    });

    /**
     * Checks if the current process is running inside a tmux session by checking the TMUX environment variable.
     */
    const isInSession = Effect.fn("tmux.isInSession")(function* () {
      const tmux = yield* Config.option(Config.string("TMUX"))
        .asEffect()
        .pipe(
          Effect.mapError(
            (error) =>
              new TmuxError({
                message: error.message,
              }),
          ),
        );

      return Option.isSome(tmux);
    });

    /**
     * Creates a new tmux session with the given name and path by running `tmux new-session -d -s <sessionName> -c <path>` command.
     */
    const createSession = Effect.fn("tmux.createSession")(function* (
      sessionName: string,
      path: string,
    ) {
      const process = yield* spawn(
        ChildProcess.make`tmux new-session -d -s ${sessionName} -c ${path}`,
      );

      const stderr = yield* process.stderr.pipe(Stream.decodeText, Stream.mkString);
      const exitCode = yield* process.exitCode;

      if (exitCode !== 0) {
        return yield* new TmuxError({
          message: `Failed to create tmux session '${sessionName}' at path '${path}'`,
          stderr: stderr,
        });
      }
    });

    /**
     * Switches to an existing tmux session with the given name by running `tmux switch-client -t <sessionName>` command.
     */
    const switchClient = Effect.fn("tmux.switchClient")(function* (sessionName: string) {
      yield* run(["tmux", "switch-client", "-t", sessionName]).pipe(
        Effect.mapError(
          (error) =>
            new TmuxError({
              message: `Failed to switch to tmux session '${sessionName}'`,
              stderr: error.stderr,
            }),
        ),
      );
    });

    /**
     * Attaches to an existing tmux session with the given name by running `tmux attach-session -t <sessionName>` command.
     */
    const attachSession = Effect.fn("tmux.attachSession")(function* (sessionName: string) {
      yield* run(["tmux", "attach-session", "-t", sessionName]).pipe(
        Effect.mapError(
          (error) =>
            new TmuxError({
              message: `Failed to attach to tmux session '${sessionName}'`,
              stderr: error.stderr,
            }),
        ),
      );
    });

    const sessionName = (project: ProjectModel) => {
      return `${project.name}-${project.branch ?? "main"}`;
    };

    const killSession = Effect.fn("tmux.killSession")(function* (sessionName: string) {
      const process = yield* spawn(
        ChildProcess.make({
          shell: true,
        })`tmux kill-session -t ${sessionName}`,
      );

      const stderr = yield* process.stderr.pipe(Stream.decodeText, Stream.mkString);
      const exitCode = yield* process.exitCode;

      if (exitCode !== 0) {
        return yield* new TmuxError({
          message: `Failed to kill tmux session '${sessionName}'`,
          stderr: stderr,
        });
      }
    });

    return {
      ensureInstalled,
      hasSession,
      isInSession,
      createSession,
      switchClient,
      attachSession,
      sessionName,
      killSession,
    };
  }),
);
