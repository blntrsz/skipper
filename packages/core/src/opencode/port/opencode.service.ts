import { Effect, Schema, ServiceMap } from "effect";

export const OpenCodeErrorReason = Schema.Union([
  Schema.Literal("AuthenticationFailed"),
  Schema.Literal("BinaryMissing"),
  Schema.Literal("ExecutionFailed"),
]);
export type OpenCodeErrorReason = typeof OpenCodeErrorReason.Type;

export class OpenCodeError extends Schema.TaggedErrorClass<OpenCodeError>("OpenCodeError")(
  "OpenCodeError",
  {
    message: Schema.String,
    reason: OpenCodeErrorReason,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export type OpenCodeSession = {
  id: string;
  title: string;
};

export type OpenCodeTranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface OpenCodeService {
  createSession: (
    cwd: string,
    title: string,
  ) => Effect.Effect<OpenCodeSession, OpenCodeError, never>;
  promptSession: (
    cwd: string,
    sessionId: string,
    prompt: string,
    onTextDelta: (chunk: string) => Effect.Effect<void, never, never>,
  ) => Effect.Effect<void, OpenCodeError, never>;
  listMessages: (
    cwd: string,
    sessionId: string,
  ) => Effect.Effect<ReadonlyArray<OpenCodeTranscriptMessage>, OpenCodeError, never>;
  abortSession: (cwd: string, sessionId: string) => Effect.Effect<void, never, never>;
}

export const OpenCodeService = ServiceMap.Service<OpenCodeService>("OpenCodeService");
