import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";

export const listSessionsCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const sessions = yield* SessionUseCase.listSessions();

    yield* Console.table(sessions);
  }),
).pipe(Command.withDescription("List all sessions"));
