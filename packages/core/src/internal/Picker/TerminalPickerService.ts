import { Effect, ServiceMap } from "effect";
import { Prompt } from "effect/unstable/cli";
import { PickerCancelled, PickerError, PickerService } from "./PickerService";

const MAX_VISIBLE = 8;

export const TerminalPickerService = ServiceMap.make(PickerService, {
  pick: ({ options, message }) =>
    Effect.gen(function* () {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return yield* Effect.fail(
          new PickerError({ message: "Interactive picker requires a TTY" }),
        );
      }

      if (options.length === 0) {
        return yield* Effect.fail(
          new PickerError({
            message: `No options available for ${message}`,
          }),
        );
      }

      return yield* Prompt.run(
        Prompt.autoComplete({
          message,
          maxPerPage: MAX_VISIBLE,
          emptyMessage: "No matches",
          choices: options.map((option) => ({ title: option, value: option })),
        }),
      );
    }).pipe(Effect.mapError(() => new PickerCancelled({}))),
});
