import { DateTime, Effect, Schema } from "effect";
import { Model } from "effect/unstable/schema";
import { ulid } from "ulid";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export function generateSessionId(): SessionId {
  return SessionId.makeUnsafe(ulid());
}

export const SessionState = Schema.Union([
  Schema.Literal("idle"),
  Schema.Literal("working"),
  Schema.Literal("unread"),
  Schema.Literal("stuck"),
]);
export type SessionState = typeof SessionState.Type;

export class Session extends Model.Class<Session>("Session")({
  id: Model.GeneratedByApp(SessionId),
  repository: Schema.String,
  branch: Schema.String,
  title: Schema.String,
  state: SessionState,
  createdAt: Model.GeneratedByApp(Schema.Number),
  updatedAt: Model.GeneratedByApp(Schema.Number),
  lastMessageAt: Model.GeneratedByApp(Schema.Number),
}) {}

export const SessionCreate = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String,
  title: Schema.String,
});
export type SessionCreate = typeof SessionCreate.Type;

export const make = Effect.fn(function* (input: SessionCreate) {
  const now = yield* DateTime.now;
  const timestamp = DateTime.toEpochMillis(now);

  return Session.makeUnsafe({
    id: generateSessionId(),
    repository: input.repository,
    branch: input.branch,
    title: input.title,
    state: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
  });
});
