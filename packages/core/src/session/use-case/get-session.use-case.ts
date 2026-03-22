import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionId } from "../domain/session.model";

export const getSession = Effect.fn("session.get")(function* (id: SessionId) {
  const service = yield* SessionService;
  return yield* service.get(id);
});
