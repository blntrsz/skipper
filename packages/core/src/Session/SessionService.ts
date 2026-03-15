import { type Effect, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SchemaError } from "effect/Schema";
import type { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type * as Session from "../domain/Session";
import type * as SessionMessage from "../domain/SessionMessage";

export interface SessionService {
  create: (
    data: Session.SessionCreate,
  ) => Effect.Effect<Session.Session, SqlError | SchemaError, SqlClient.SqlClient>;
  get: (
    id: Session.SessionId,
  ) => Effect.Effect<
    Session.Session,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  list: () => Effect.Effect<
    ReadonlyArray<Session.Session>,
    SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  delete: (
    id: Session.SessionId,
  ) => Effect.Effect<void, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
  listMessages: (
    sessionId: Session.SessionId,
  ) => Effect.Effect<
    ReadonlyArray<SessionMessage.SessionMessage>,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  addMessage: (
    sessionId: Session.SessionId,
    role: SessionMessage.SessionMessageRole,
    content: string,
    nextState?: Session.SessionState,
  ) => Effect.Effect<
    SessionMessage.SessionMessage,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  updateState: (
    sessionId: Session.SessionId,
    state: Session.SessionState,
  ) => Effect.Effect<
    Session.Session,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
}

export const SessionService = ServiceMap.Service<SessionService>("SessionService");
