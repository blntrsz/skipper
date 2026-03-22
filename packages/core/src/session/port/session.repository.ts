import { type Effect, Schema, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { Session, SessionId } from "../domain/session.model";
import type { SessionMessage } from "../domain/session-message.model";

export interface SessionRepository {
  insertVoid: (session: Session) => Effect.Effect<void, Schema.SchemaError | SqlError, never>;
  findById: (
    sessionId: SessionId,
  ) => Effect.Effect<Session, NoSuchElementError | Schema.SchemaError | SqlError, never>;
  list: () => Effect.Effect<ReadonlyArray<Session>, Schema.SchemaError | SqlError, never>;
  update: (session: Session) => Effect.Effect<Session, Schema.SchemaError | SqlError, never>;
  delete: (
    sessionId: SessionId,
  ) => Effect.Effect<void, NoSuchElementError | Schema.SchemaError | SqlError, never>;
  listMessages: (
    sessionId: SessionId,
  ) => Effect.Effect<
    ReadonlyArray<SessionMessage>,
    NoSuchElementError | Schema.SchemaError | SqlError,
    never
  >;
  insertMessage: (
    message: SessionMessage,
  ) => Effect.Effect<void, Schema.SchemaError | SqlError, never>;
  deleteMessagesBySessionId: (sessionId: SessionId) => Effect.Effect<void, SqlError, never>;
}

export const SessionRepository = ServiceMap.Service<SessionRepository>("SessionRepository");
