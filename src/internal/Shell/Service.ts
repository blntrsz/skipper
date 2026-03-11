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
