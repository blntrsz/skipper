import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag } from "./session.common";

export const listSessionMessagesCommand = Command.make("messages", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const messages = yield* SessionUseCase.listSessionMessages(input.id);

    yield* Console.table(messages);
  }),
).pipe(Command.withDescription("List session messages"));
