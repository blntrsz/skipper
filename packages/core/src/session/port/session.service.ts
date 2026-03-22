import { type Effect, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SchemaError } from "effect/Schema";
import type { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { Session, SessionCreate, SessionId, SessionState } from "../domain/session.model";
import type { SessionMessage, SessionMessageRole } from "../domain/session-message.model";

export interface SessionService {
  create: (
    data: SessionCreate,
  ) => Effect.Effect<Session, SqlError | SchemaError, SqlClient.SqlClient>;
  get: (
    sessionId: SessionId,
  ) => Effect.Effect<Session, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
  list: () => Effect.Effect<ReadonlyArray<Session>, SqlError | SchemaError, SqlClient.SqlClient>;
  delete: (
    sessionId: SessionId,
  ) => Effect.Effect<void, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
  listMessages: (
    sessionId: SessionId,
  ) => Effect.Effect<
    ReadonlyArray<SessionMessage>,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  addMessage: (
    sessionId: SessionId,
    role: SessionMessageRole,
    content: string,
    nextState?: SessionState,
  ) => Effect.Effect<
    SessionMessage,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  updateState: (
    sessionId: SessionId,
    state: SessionState,
  ) => Effect.Effect<Session, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
}

export const SessionService = ServiceMap.Service<SessionService>("SessionService");
