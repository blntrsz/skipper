import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";

export const listTasksCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const tasks = yield* Task.listTasks();

    yield* Console.table(tasks);
  }),
).pipe(Command.withDescription("List all tasks"));
