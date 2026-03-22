import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { flags } from "./task.common";

export const listTasksByRepositoryCommand = Command.make(
  "list-by-repository",
  {
    repository: flags.repository,
  },
  (input) =>
    Effect.gen(function* () {
      const tasks = yield* Task.listTasksByRepository(input.repository);

      yield* Console.table(tasks);
    }),
).pipe(Command.withDescription("List tasks by repository"));
