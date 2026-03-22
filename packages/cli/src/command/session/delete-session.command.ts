import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag } from "./session.common";

export const deleteSessionCommand = Command.make("delete", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    yield* SessionUseCase.deleteSession(input.id);
    yield* Console.table({ deleted: true, id: input.id });
  }),
).pipe(Command.withDescription("Delete session"));
