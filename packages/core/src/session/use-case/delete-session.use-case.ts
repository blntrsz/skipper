import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionId } from "../domain/session.model";

export const deleteSession = Effect.fn("session.delete")(function* (id: SessionId) {
  const service = yield* SessionService;
  return yield* service.delete(id);
});
