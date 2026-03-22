import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { printJson } from "./session.common";

export const listSessionsCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const sessions = yield* SessionUseCase.listSessions();

    yield* printJson(sessions);
  }),
).pipe(Command.withDescription("List all sessions"));
