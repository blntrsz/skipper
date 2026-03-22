import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionId } from "../domain/session.model";

export const listSessionMessages = Effect.fn("session.listMessages")(function* (
  sessionId: SessionId,
) {
  const service = yield* SessionService;
  return yield* service.listMessages(sessionId);
});
