import { Effect, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Session from "../domain/Session";
import * as SessionMessage from "../domain/SessionMessage";
import { SessionRepository } from "./Repository";
import { SessionService } from "./SessionService";

const resolveState = (
  currentState: Session.SessionState,
  nextState?: Session.SessionState,
): Session.SessionState => {
  if (nextState === undefined) {
    return currentState;
  }

  if (currentState === "stuck" && nextState !== "stuck") {
    return currentState;
  }

  return nextState;
};

const withSessionTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(effect);
  });

const create: SessionService["create"] = (data) =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;

    const session = yield* Session.make(data);

    yield* repository.insertVoid(session);

    return session;
  });

const get: SessionService["get"] = (id) =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;

    return yield* repository.findById(id);
  });

const list: SessionService["list"] = () =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;

    return yield* repository.list();
  });

const del: SessionService["delete"] = (id) =>
  withSessionTransaction(
    Effect.gen(function* () {
      const repository = yield* SessionRepository;

      yield* repository.findById(id);
      yield* repository.deleteMessagesBySessionId(id);
      yield* repository.delete(id);
    }),
  );

const listMessages: SessionService["listMessages"] = (sessionId) =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;

    yield* repository.findById(sessionId);

    return yield* repository.listMessages(sessionId);
  });

const addMessage: SessionService["addMessage"] = (
  sessionId,
  role,
  content,
  nextState,
) =>
  withSessionTransaction(
    Effect.gen(function* () {
      const repository = yield* SessionRepository;
      const session = yield* repository.findById(sessionId);
      const message = yield* SessionMessage.make({
        sessionId,
        role,
        content,
      });

      yield* repository.insertMessage(message);
      yield* repository.update({
        ...session,
        state: resolveState(session.state, nextState),
        updatedAt: message.createdAt,
        lastMessageAt: message.createdAt,
      });

      return message;
    }),
  );

const updateState: SessionService["updateState"] = (sessionId, state) =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const session = yield* repository.findById(sessionId);

    return yield* repository.update({
      ...session,
      state,
      updatedAt: Date.now(),
    });
  });

export const SqlSessionService = ServiceMap.make(SessionService, {
  create,
  get,
  list,
  delete: del,
  listMessages,
  addMessage,
  updateState,
});
