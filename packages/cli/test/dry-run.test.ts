/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

describe("cli dry-run", () => {
  it.effect("noop spawner returns exit code 0 without executing", () =>
    Effect.gen(function* () {
      const noopSpawner = ChildProcessSpawner.make(() =>
        Effect.succeed(
          ChildProcessSpawner.makeHandle({
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
          }),
        ),
      );

      const handle = yield* noopSpawner.spawn(ChildProcess.make`echo hello`);

      expect(yield* handle.exitCode).toBe(0);
      expect(yield* handle.isRunning).toBe(false);
    }),
  );
});
