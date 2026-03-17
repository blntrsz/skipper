import { type Effect, Schema, ServiceMap } from "effect";

export class ShellError extends Schema.TaggedErrorClass<ShellError>("skipper/ShellError")(
  "ShellError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface ShellService {
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
  exec: ({
    command,
    errorMessage,
  }: {
    command: string[];
    errorMessage: string;
  }) => Effect.Effect<void, ShellError, never>;
  run: ({
    command,
    cwd,
    env,
    errorMessage,
  }: {
    command: string;
    cwd?: string;
    env?: Record<string, string | undefined>;
    errorMessage?: string;
  }) => Effect.Effect<number, ShellError, never>;
}

export const ShellService = ServiceMap.Service<ShellService>("ShellService");
