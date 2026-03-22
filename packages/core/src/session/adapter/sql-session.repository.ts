import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlModel, SqlSchema } from "effect/unstable/sql";
import { Session } from "../domain/session.model";
import { SessionMessage } from "../domain/session-message.model";
import { SessionRepository } from "../port/session.repository";
import { SessionId } from "../domain/session.model";

const BaseSessionRepository = SqlModel.makeRepository(Session, {
  idColumn: "id",
  tableName: "sessions",
  spanPrefix: "SessionRepository",
});

const BaseSessionMessageRepository = SqlModel.makeRepository(SessionMessage, {
  idColumn: "id",
  tableName: "session_messages",
  spanPrefix: "SessionMessageRepository",
});

const listSessions = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Void,
    Result: Session,
    execute: () => sql`SELECT * FROM sessions ORDER BY updated_at DESC, id DESC`,
  });
});

const listSessionMessages = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Struct({ sessionId: SessionId }),
    Result: SessionMessage,
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

  return (sessionId: SessionId) =>
    sql`DELETE FROM session_messages WHERE session_id = ${sessionId}`.pipe(Effect.asVoid);
});

export const SqlSessionRepositoryLayer = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const sessionRepository = yield* BaseSessionRepository;
    const sessionMessageRepository = yield* BaseSessionMessageRepository;
    const findAll = yield* listSessions;
    const findMessages = yield* listSessionMessages;
    const deleteMessages = yield* deleteMessagesBySessionId;

    return {
      ...sessionRepository,
      list: () => findAll(undefined),
      listMessages: (sessionId: SessionId) => findMessages({ sessionId }),
      insertMessage: (message: SessionMessage) => sessionMessageRepository.insertVoid(message),
      deleteMessagesBySessionId: (sessionId: SessionId) => deleteMessages(sessionId),
    } as const;
  }),
);
