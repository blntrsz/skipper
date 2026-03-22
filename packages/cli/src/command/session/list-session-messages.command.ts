import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag, printJson } from "./session.common";

export const listSessionMessagesCommand = Command.make("messages", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const messages = yield* SessionUseCase.listSessionMessages(input.id);

    yield* printJson(messages);
  }),
).pipe(Command.withDescription("List session messages"));
