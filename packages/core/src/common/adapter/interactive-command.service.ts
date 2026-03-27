import { Effect, Layer, Schema, ServiceMap } from "effect";

type InteractiveWritable = "pipe" | "inherit" | "ignore";
type InteractiveReadable = "pipe" | "inherit" | "ignore";

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
    run: (
      command: string,
      args: ReadonlyArray<string>,
      options?: {
        env?: Record<string, string>;
        stdin?: InteractiveWritable;
        stdout?: InteractiveReadable;
        stderr?: InteractiveReadable;
      },
    ) => Effect.Effect<void, InteractiveCommandError>;
  }
>()("@skippercorp/core/common/adapter/interactive-command.service/InteractiveCommandService") {}

export const InteractiveCommandServiceLayer = Layer.effect(
  InteractiveCommandService,
  Effect.sync(() => {
    const run = Effect.fn("interactiveCommand.run")(function* (
      command: string,
      args: ReadonlyArray<string>,
      options?: {
        env?: Record<string, string>;
        stdin?: InteractiveWritable;
        stdout?: InteractiveReadable;
        stderr?: InteractiveReadable;
      },
    ) {
      return yield* Effect.try({
        try: () => {
          const process = Bun.spawn({
            cmd: [command, ...args],
            env: options?.env,
            stdin: options?.stdin ?? "inherit",
            stdout: options?.stdout ?? "inherit",
            stderr: options?.stderr ?? "inherit",
            detached: true,
          });

          process.unref();
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
