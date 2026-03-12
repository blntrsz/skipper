import { DateTime, Effect, Schema } from "effect";
import { Model } from "effect/unstable/schema";
import { ulid } from "ulid";
import { SessionId } from "./Session";

export const SessionMessageId = Schema.String.pipe(
  Schema.brand("SessionMessageId")
);
export type SessionMessageId = typeof SessionMessageId.Type;

export function generateSessionMessageId(): SessionMessageId {
  return SessionMessageId.makeUnsafe(ulid());
}

export const SessionMessageRole = Schema.Union([
  Schema.Literal("user"),
  Schema.Literal("assistant"),
  Schema.Literal("system"),
]);
export type SessionMessageRole = typeof SessionMessageRole.Type;

export class SessionMessage extends Model.Class<SessionMessage>(
  "SessionMessage"
)({
  id: Model.GeneratedByApp(SessionMessageId),
  sessionId: SessionId,
  role: SessionMessageRole,
  content: Schema.String,
  createdAt: Model.GeneratedByApp(Schema.Number),
}) {}

export const SessionMessageCreate = Schema.Struct({
  sessionId: SessionId,
  role: SessionMessageRole,
  content: Schema.String,
});
export type SessionMessageCreate = typeof SessionMessageCreate.Type;

export const make = Effect.fn(function* (input: SessionMessageCreate) {
  const now = yield* DateTime.now;

  return SessionMessage.makeUnsafe({
    id: generateSessionMessageId(),
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    createdAt: DateTime.toEpochMillis(now),
  });
});
