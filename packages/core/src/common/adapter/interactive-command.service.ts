import { Effect, Layer, Schema, ServiceMap } from "effect";
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { spawnSync } from "node:child_process";

export class InteractiveCommandError extends Schema.TaggedErrorClass<InteractiveCommandError>()(
  "InteractiveCommandError",
  {
    message: Schema.String,
    stderr: Schema.optional(Schema.String),
  },
) {}

export class InteractiveCommandService extends ServiceMap.Service<
  InteractiveCommandService,
  {
    run: (command: string) => Effect.Effect<void, InteractiveCommandError>;
  }
>()("@skippercorp/core/common/adapter/interactive-command.service/InteractiveCommandService") {}

export const InteractiveCommandServiceLayer = Layer.effect(
  InteractiveCommandService,
  Effect.sync(() => {
    const run = Effect.fn("interactiveCommand.run")(function* (command: string) {
      return yield* Effect.try({
        try: () => {
          return spawnSync(command, {
            stdio: "inherit",
            shell: true,
          });
        },
        catch: (error) =>
          new InteractiveCommandError({
            message: error instanceof Error ? error.message : String(error),
          }),
      });
    });

    return {
      run,
    };
  }),
);
