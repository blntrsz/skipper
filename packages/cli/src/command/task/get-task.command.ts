import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { flags } from "./task.common";

export const getTaskCommand = Command.make("get", { id: flags.id }, (input) =>
  Effect.gen(function* () {
    const task = yield* Task.getTask(input.id);

    yield* Console.table(task);
  }),
).pipe(Command.withDescription("Get task by id"));
