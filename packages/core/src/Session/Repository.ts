import { Effect, Schema } from "effect";
import { SqlClient, SqlModel, SqlSchema } from "effect/unstable/sql";
import * as Session from "../domain/Session";
import * as SessionMessage from "../domain/SessionMessage";

const BaseSessionRepository = SqlModel.makeRepository(Session.Session, {
  idColumn: "id",
  tableName: "sessions",
  spanPrefix: "SessionRepository",
});

const BaseSessionMessageRepository = SqlModel.makeRepository(
  SessionMessage.SessionMessage,
  {
    idColumn: "id",
    tableName: "session_messages",
    spanPrefix: "SessionMessageRepository",
  },
);

const listSessions = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Void,
    Result: Session.Session,
    execute: () =>
      sql`SELECT * FROM sessions ORDER BY updated_at DESC, id DESC`,
  });
});

const listSessionMessages = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Struct({ sessionId: Session.SessionId }),
    Result: SessionMessage.SessionMessage,
    execute: ({ sessionId }) =>
      sql`
        SELECT *
        FROM session_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC, id ASC
      `,
  });
});

const deleteMessagesBySessionId = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return (sessionId: Session.SessionId) =>
    sql`DELETE FROM session_messages WHERE session_id = ${sessionId}`.pipe(
      Effect.asVoid,
    );
});

export const SessionRepository = Effect.gen(function* () {
  const sessionRepository = yield* BaseSessionRepository;
  const sessionMessageRepository = yield* BaseSessionMessageRepository;
  const findAll = yield* listSessions;
  const findMessages = yield* listSessionMessages;
  const deleteMessages = yield* deleteMessagesBySessionId;

  return {
    ...sessionRepository,
    list: () => findAll(undefined),
    listMessages: (sessionId: Session.SessionId) => findMessages({ sessionId }),
    insertMessage: (message: SessionMessage.SessionMessage) =>
      sessionMessageRepository.insertVoid(message),
    deleteMessagesBySessionId: (sessionId: Session.SessionId) =>
      deleteMessages(sessionId),
  } as const;
});
