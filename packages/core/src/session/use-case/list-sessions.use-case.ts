import { Effect } from "effect";
import { SessionService } from "../port/session.service";

export const listSessions = Effect.fn("session.list")(function* () {
  const service = yield* SessionService;
  return yield* service.list();
});
