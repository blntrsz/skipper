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
    ) => Effect.Effect<
      {
        exitCode: number;
        stdout: string;
        stderr: string;
      },
      InteractiveCommandError
    >;
  }
>()("@skippercorp/core/common/adapter/interactive-command/InteractiveCommandService") {}

export const InteractiveCommandServiceLayer = Layer.effect(
  InteractiveCommandService,
  Effect.sync(() => {
    const readStream = (stream?: ReadableStream<Uint8Array> | null) => {
      return stream ? new Response(stream).text() : Promise.resolve("");
    };

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
      const child = yield* Effect.try({
        try: () =>
          Bun.spawn({
            cmd: [command, ...args],
            env: options?.env,
            stdin: options?.stdin ?? "ignore",
            stdout: options?.stdout ?? "pipe",
            stderr: options?.stderr ?? "pipe",
            shell: true,
          } as Bun.SpawnOptions.SpawnOptions<
            InteractiveWritable,
            InteractiveReadable,
            InteractiveReadable
          > & {
            cmd: string[];
            shell: true;
          }),
        catch: (error) =>
          new InteractiveCommandError({
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

    return {
      run,
    };
  }),
);
