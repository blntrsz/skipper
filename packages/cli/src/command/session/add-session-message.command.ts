import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Option, Console } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { idFlag, sessionStateChoices, sessionMessageRoleChoices } from "./session.common";

export const addSessionMessageCommand = Command.make(
  "add-message",
  {
    id: idFlag,
    role: Flag.choice("role", sessionMessageRoleChoices).pipe(Flag.withDescription("Message role")),
    state: Flag.optional(
      Flag.choice("state", sessionStateChoices).pipe(Flag.withDescription("Next session state")),
    ),
    content: Flag.string("content").pipe(Flag.withDescription("Message content")),
  },
  (input) =>
    Effect.gen(function* () {
      const message = yield* SessionUseCase.addSessionMessage(
        input.id,
        input.role,
        input.content,
        Option.getOrUndefined(input.state),
      );

      yield* Console.table(message);
    }),
).pipe(Command.withDescription("Add session message"));
