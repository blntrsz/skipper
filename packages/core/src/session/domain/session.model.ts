import { DateTime, Effect, Schema } from "effect";
import { Model } from "effect/unstable/schema";
import { ulid } from "ulid";
import { SandboxKind, resolveSandboxKind } from "../../workspace/domain/project.model";

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
  sandbox: SandboxKind,
  title: Schema.String,
  providerSessionId: Schema.optional(Schema.String),
  state: SessionState,
  createdAt: Model.GeneratedByApp(Schema.Number),
  updatedAt: Model.GeneratedByApp(Schema.Number),
  lastMessageAt: Model.GeneratedByApp(Schema.Number),
}) {}

export const SessionCreate = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String,
  sandbox: Schema.optional(SandboxKind),
  title: Schema.String,
  providerSessionId: Schema.optional(Schema.String),
});
export type SessionCreate = typeof SessionCreate.Type;

export const make = Effect.fn("session.make")(function* (input: SessionCreate) {
  const now = yield* DateTime.now;
  const timestamp = DateTime.toEpochMillis(now);

  return Session.makeUnsafe({
    id: generateSessionId(),
    repository: input.repository,
    branch: input.branch,
    sandbox: resolveSandboxKind(input.sandbox),
    title: input.title,
    providerSessionId: input.providerSessionId,
    state: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
  });
});
