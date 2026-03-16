import { expect, it } from "@effect/vitest";
import { Picker } from "@skippercorp/core";
import { testLayer } from "@skippercorp/core/TestRuntime";
import { Effect, FileSystem } from "effect";
import { UnknownError } from "effect/Cause";
import { Command } from "effect/unstable/cli";
import { sandboxCommand } from "../src/Sandbox";

const runSandboxCommand = Command.runWith(sandboxCommand, { version: "test" });

it.layer(testLayer)("SandboxCli", (test) => {
  test.effect("run fails when there are no repositories to choose from", () =>
    Effect.gen(function* () {
      const error = yield* runSandboxCommand(["run"]).pipe(
        Effect.provideService(
          FileSystem.FileSystem,
          {
            readDirectory: () => Effect.succeed([]),
          } as unknown as FileSystem.FileSystem,
        ),
        Effect.flip,
      );

      expect(error).toBeInstanceOf(UnknownError);
      expect((error as UnknownError).message).toContain("No repositories found");
    }),
  );

  test.effect("run exits cleanly when the repository picker is cancelled", () =>
    Effect.gen(function* () {
      const picker = {
        pick: () => Effect.fail(new Picker.PickerCancelled({})),
      };

      yield* runSandboxCommand(["run"]).pipe(
        Effect.provideService(Picker.PickerService, picker),
        Effect.provideService(
          FileSystem.FileSystem,
          {
            readDirectory: () => Effect.succeed(["repo-a"]),
            stat: () => Effect.succeed({ type: "Directory" }),
            exists: () => Effect.succeed(true),
          } as unknown as FileSystem.FileSystem,
        ),
      );
    }),
  );
});
