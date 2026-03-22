import * as SessionUseCase from "@skippercorp/core/session/use-case";
import { Effect, Console } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const createSessionCommand = Command.make(
  "create",
  {
    repository: Flag.string("repository").pipe(Flag.withDescription("Repository name")),
    branch: Flag.string("branch").pipe(Flag.withDescription("Branch name")),
    title: Flag.string("title").pipe(Flag.withDescription("Session title")),
  },
  (input) =>
    Effect.gen(function* () {
      const session = yield* SessionUseCase.createSession({
        repository: input.repository,
        branch: input.branch,
        title: input.title,
      });

      yield* Console.table(session);
    }),
).pipe(Command.withDescription("Create session"));
