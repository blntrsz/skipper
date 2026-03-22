import * as Task from "@skippercorp/core/task/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { printJson } from "./task.common";

export const listTasksCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const tasks = yield* Task.listTasks();

    yield* printJson(tasks);
  }),
).pipe(Command.withDescription("List all tasks"));
