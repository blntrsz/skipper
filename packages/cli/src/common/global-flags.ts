import { Console, Effect, Layer, Sink, Stream } from "effect";
import { Flag, GlobalFlag } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { noopConsole } from "@skippercorp/core/common/adapter/noop-console";

export type SandboxBackend = "worktree" | "docker";

export const Sandbox = GlobalFlag.setting("sandbox")({
  flag: Flag.string("sandbox").pipe(
    Flag.withDefault("worktree"),
    Flag.withDescription("Sandbox backend: worktree or docker"),
  ),
});

export const Silent = GlobalFlag.setting("silent")({
  flag: Flag.boolean("silent").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Disable console output"),
  ),
});

export const ConsoleLayer = Layer.effect(
  Console.Console,
  Effect.gen(function* () {
    const silent = yield* Silent;
    const currentConsole = yield* Console.Console;

    return silent ? noopConsole : currentConsole;
  }),
);

export const DryRun = GlobalFlag.setting("dry-run")({
  flag: Flag.boolean("dry-run").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Simulate the command without making any changes"),
  ),
});

export const parseSandboxBackend = (value: string): SandboxBackend => {
  if (value === "docker") return "docker";
  return "worktree";
};

/**
 * Parse --sandbox flag from process.argv before Effect CLI runs.
 * This allows selecting the runtime layer at the entry point.
 */
export const getSandboxBackendFromArgv = (): SandboxBackend => {
  const args = process.argv;
  const idx = args.indexOf("--sandbox");
  if (idx !== -1 && idx + 1 < args.length) {
    return parseSandboxBackend(args[idx + 1] ?? "worktree");
  }
  return "worktree";
};

export const DryRunLayer = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    const dryRun = yield* DryRun;
    const currentSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    if (!dryRun) {
      return currentSpawner;
    }

    return ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        yield* Console.log(command);

        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        });
      }),
    );
  }),
);
