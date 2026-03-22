import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag, printJson } from "./session.common";

export const getSessionCommand = Command.make("get", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const session = yield* SessionUseCase.getSession(input.id);

    yield* printJson(session);
  }),
).pipe(Command.withDescription("Get session by id"));
