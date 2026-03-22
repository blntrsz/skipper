import * as Task from "@skippercorp/core/task/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, printJson } from "./task.common";

export const getTaskCommand = Command.make("get", { id: flags.id }, (input) =>
  Effect.gen(function* () {
    const task = yield* Task.getTask(input.id);

    yield* printJson(task);
  }),
).pipe(Command.withDescription("Get task by id"));
