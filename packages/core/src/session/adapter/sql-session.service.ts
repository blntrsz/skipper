import { Effect, Layer } from "effect";
import type { SessionState } from "../domain/session.model";
import { SessionService } from "../port/session.service";
import { SessionRepository } from "../port/session.repository";
import { make } from "../domain/session.model";
import { make as makeSessionMessage } from "../domain/session-message.model";

const resolveState = (currentState: SessionState, nextState?: SessionState): SessionState => {
  if (nextState === undefined) {
    return currentState;
  }

  if (currentState === "stuck" && nextState !== "stuck") {
    return currentState;
  }

  return nextState;
};

export const SqlSessionServiceLayer = Layer.effect(
  SessionService,
  Effect.gen(function* () {
    const repository = yield* SessionRepository;

    const create: SessionService["create"] = (data) =>
      Effect.gen(function* () {
        const session = yield* make(data);
        yield* repository.insertVoid(session);
        return session;
      });

    const get: SessionService["get"] = (id) => repository.findById(id);

    const list: SessionService["list"] = () => repository.list();

    const del: SessionService["delete"] = (id) =>
      Effect.gen(function* () {
        yield* repository.findById(id);
        yield* repository.deleteMessagesBySessionId(id);
        yield* repository.delete(id);
      });

    const listMessages: SessionService["listMessages"] = (sessionId) =>
      Effect.gen(function* () {
        yield* repository.findById(sessionId);
        return yield* repository.listMessages(sessionId);
      });

    const addMessage: SessionService["addMessage"] = (sessionId, role, content, nextState) =>
      Effect.gen(function* () {
        const session = yield* repository.findById(sessionId);
        const message = yield* makeSessionMessage({
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
      });

    const updateState: SessionService["updateState"] = (sessionId, state) =>
      Effect.gen(function* () {
        const session = yield* repository.findById(sessionId);

        return yield* repository.update({
          ...session,
          state,
          updatedAt: Date.now(),
        });
      });

    return {
      create,
      get,
      list,
      delete: del,
      listMessages,
      addMessage,
      updateState,
    };
  }),
);
