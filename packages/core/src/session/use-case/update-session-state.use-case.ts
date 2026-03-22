import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionId, SessionState } from "../domain/session.model";

export const updateSessionState = Effect.fn("session.updateState")(function* (
  id: SessionId,
  state: SessionState,
) {
  const service = yield* SessionService;
  return yield* service.updateState(id, state);
});
