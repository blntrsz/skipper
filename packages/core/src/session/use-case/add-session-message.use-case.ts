import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionId, SessionState } from "../domain/session.model";
import type { SessionMessageRole } from "../domain/session-message.model";

export const addSessionMessage = Effect.fn("session.addMessage")(function* (
  sessionId: SessionId,
  role: SessionMessageRole,
  content: string,
  nextState?: SessionState,
) {
  const service = yield* SessionService;
  return yield* service.addMessage(sessionId, role, content, nextState);
});
