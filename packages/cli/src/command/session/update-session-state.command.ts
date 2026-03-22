import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { idFlag, sessionStateChoices } from "./session.common";

export const updateSessionStateCommand = Command.make(
  "update-state",
  {
    id: idFlag,
    state: Flag.choice("state", sessionStateChoices).pipe(Flag.withDescription("Session state")),
  },
  (input) =>
    Effect.gen(function* () {
      const session = yield* SessionUseCase.updateSessionState(input.id, input.state);

      yield* Console.table(session);
    }),
).pipe(Command.withDescription("Update session state"));
