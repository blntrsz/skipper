import { Effect, Layer, PlatformError, Schema, Scope, ServiceMap } from "effect";
import type { ProjectModel } from "../workspace";

export class TmuxError extends Schema.TaggedErrorClass<TmuxError>()("TmuxError", {
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
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, Scope.Scope>;
    attachSession: (
      sessionName: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, Scope.Scope>;
    sessionName: (project: ProjectModel) => string;
    killSession: (
      sessionName: string,
    ) => Effect.Effect<void, PlatformError.PlatformError | TmuxError, Scope.Scope>;
  }
>()("@skippercorp/core/common/tmux/TmuxService") {}

export const TmuxServiceImpl = Layer.effect(
  TmuxService,
  Effect.sync(() => {
    const processEnv = () => {
      const env: Record<string, string> = {};

      for (const [key, value] of Object.entries(globalThis.process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }

      return env;
    };

    const tmuxServerEnv = () => {
      const env = processEnv();
      delete env.TMUX;
      delete env.TMUX_PANE;
      return env;
    };

    const readStream = (stream?: ReadableStream<Uint8Array> | null) => {
      return stream ? new Response(stream).text() : Promise.resolve("");
    };

    const runCommand = Effect.fn("tmux.runCommand")(function* (
      command: string,
      args: ReadonlyArray<string>,
      options?: {
        env?: "client" | "server";
        stdin?: "inherit" | "ignore" | "pipe";
        stdout?: "inherit" | "ignore" | "pipe";
        stderr?: "inherit" | "ignore" | "pipe";
      },
    ) {
      const child = yield* Effect.try({
        try: () =>
          Bun.spawn([command, ...args], {
            env: options?.env === "client" ? processEnv() : tmuxServerEnv(),
            stdin: options?.stdin ?? "ignore",
            stdout: options?.stdout ?? "pipe",
            stderr: options?.stderr ?? "pipe",
          }),
        catch: (error) =>
          new TmuxError({
            message: error instanceof Error ? error.message : String(error),
          }),
      });

      const stdout = yield* Effect.promise(() =>
        options?.stdout === "inherit" || options?.stdout === "ignore"
          ? Promise.resolve("")
          : readStream(child.stdout),
      );
      const stderr = yield* Effect.promise(() =>
        options?.stderr === "inherit" || options?.stderr === "ignore"
          ? Promise.resolve("")
          : readStream(child.stderr),
      );
      const exitCode = yield* Effect.promise(() => child.exited);

      return {
        exitCode,
        stdout,
        stderr,
      };
    });

    const hasCurrentClient = Effect.fn("tmux.hasCurrentClient")(function* () {
      if (globalThis.process.env.TMUX === undefined) {
        return false;
      }

      const process = yield* runCommand("tmux", ["display-message", "-p", "#{client_tty}"], {
        env: "client",
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });

      return process.exitCode === 0;
    });

    const attachOutsideSession = Effect.fn("tmux.attachOutsideSession")(function* (
      sessionName: string,
    ) {
      const process = yield* runCommand("tmux", ["attach-session", "-t", `=${sessionName}`], {
        env: "server",
        stdin: "inherit",
        stdout: "inherit",
        stderr: "pipe",
      });

      if (process.exitCode !== 0) {
        return yield* new TmuxError({
          message: `Failed to attach to tmux session '${sessionName}'`,
          stderr: process.stderr,
        });
      }
    });

    /**
     * Checks if tmux is installed by running `which tmux` command. If tmux is not found, it throws a TmuxError with a message indicating that tmux is required for sandbox switch.
     */
    const ensureInstalled = Effect.fn("tmux.isInstalled")(function* () {
      const process = yield* runCommand("which", ["tmux"]);

      if (process.exitCode !== 0) {
        return yield* new TmuxError({
          message: "tmux is required for sandbox switch. Install tmux and retry.",
        });
      }
    });

    /**
     * Checks if a tmux session with the given name exists by running `tmux has-session -t <sessionName>` command.
     */
    const hasSession = Effect.fn("tmux.hasSession")(function* (sessionName: string) {
      const process = yield* runCommand("tmux", ["has-session", "-t", `=${sessionName}`], {
        env: (yield* hasCurrentClient()) ? "client" : "server",
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });

      return process.exitCode === 0;
    });

    /**
     * Checks if the current process is running inside a tmux session by checking the TMUX environment variable.
     */
    const isInSession = Effect.fn("tmux.isInSession")(function* () {
      return yield* hasCurrentClient();
    });

    /**
     * Creates a new tmux session with the given name and path by running `tmux new-session -d -s <sessionName> -c <path>` command.
     */
    const createSession = Effect.fn("tmux.createSession")(function* (
      sessionName: string,
      path: string,
    ) {
      const process = yield* runCommand(
        "tmux",
        ["new-session", "-d", "-s", sessionName, "-c", path],
        {
          env: (yield* hasCurrentClient()) ? "client" : "server",
          stdin: "ignore",
          stdout: "ignore",
          stderr: "pipe",
        },
      );

      if (process.exitCode !== 0) {
        return yield* new TmuxError({
          message: `Failed to create tmux session '${sessionName}' at path '${path}'`,
          stderr: process.stderr,
        });
      }
    });

    /**
     * Switches to an existing tmux session with the given name by running `tmux switch-client -t <sessionName>` command.
     */
    const switchClient = Effect.fn("tmux.switchClient")(function* (sessionName: string) {
      const hasClient = yield* hasCurrentClient();

      if (!hasClient) {
        return yield* attachOutsideSession(sessionName);
      }

      const process = yield* runCommand("tmux", ["switch-client", "-t", `=${sessionName}`], {
        env: "client",
        stdin: "inherit",
        stdout: "inherit",
        stderr: "pipe",
      });

      if (process.exitCode !== 0) {
        if (process.stderr.includes("no current client")) {
          return yield* attachOutsideSession(sessionName);
        }

        return yield* new TmuxError({
          message: `Failed to switch to tmux session '${sessionName}'`,
          stderr: process.stderr,
        });
      }
    });

    /**
     * Attaches to an existing tmux session with the given name by running `tmux attach-session -t <sessionName>` command.
     */
    const attachSession = Effect.fn("tmux.attachSession")(function* (sessionName: string) {
      const hasClient = yield* hasCurrentClient();

      if (hasClient) {
        return yield* switchClient(sessionName);
      }

      return yield* attachOutsideSession(sessionName);
    });

    const sessionName = (project: ProjectModel) => {
      return `${project.name}-${project.branch ?? "main"}`;
    };

    const killSession = Effect.fn("tmux.killSession")(function* (sessionName: string) {
      const process = yield* runCommand("tmux", ["kill-session", "-t", `=${sessionName}`], {
        env: (yield* hasCurrentClient()) ? "client" : "server",
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
      });

      if (process.exitCode !== 0) {
        return yield* new TmuxError({
          message: `Failed to kill tmux session '${sessionName}'`,
          stderr: process.stderr,
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
