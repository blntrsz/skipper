import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { idFlag, printJson } from "./session.common";

export const deleteSessionCommand = Command.make("delete", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    yield* SessionUseCase.deleteSession(input.id);
    yield* printJson({ deleted: true, id: input.id });
  }),
).pipe(Command.withDescription("Delete session"));
