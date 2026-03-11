import { Effect, Schema, ServiceMap } from "effect";

export class ShellError extends Schema.TaggedErrorClass<ShellError>(
  "skipper/ShellError"
)("ShellError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export const Shell = ServiceMap.Service<{
  bool: ({
    command,
    errorMessage,
  }: {
    command: string;
    errorMessage: string;
  }) => Effect.Effect<boolean, ShellError, never>;
  $: ({
    command,
    errorMessage,
  }: {
    command: string;
    errorMessage: string;
  }) => Effect.Effect<string, ShellError, never>;
}>("Shell");

export const BunShell = ServiceMap.make(Shell, {
  bool: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () =>
        Bun.$`${{ raw: command }}`
          .env(process.env)
          .nothrow()
          .then((result) => result.exitCode === 0),
      catch: (cause) =>
        new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        }),
    });
  },
  $: ({ command, errorMessage }) => {
    return Effect.tryPromise({
      try: async () => Bun.$`${{ raw: command }}`.env(process.env).text(),
      catch: (cause) =>
        new ShellError({
          message:
            errorMessage ??
            (cause as Error)?.message ??
            "An unknown error occurred while executing the shell command.",
          cause,
        }),
    });
  },
});
