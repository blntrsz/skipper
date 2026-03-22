import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag } from "./session.common";

export const getSessionCommand = Command.make("get", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const session = yield* SessionUseCase.getSession(input.id);

    yield* Console.table(session);
  }),
).pipe(Command.withDescription("Get session by id"));
