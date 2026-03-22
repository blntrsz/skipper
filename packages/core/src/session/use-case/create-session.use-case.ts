import { Effect } from "effect";
import { SessionService } from "../port/session.service";
import type { SessionCreate } from "../domain/session.model";

export const createSession = Effect.fn("session.create")(function* (data: SessionCreate) {
  const service = yield* SessionService;
  return yield* service.create(data);
});
