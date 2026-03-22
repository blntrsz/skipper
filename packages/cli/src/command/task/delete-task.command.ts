import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { flags } from "./task.common";

export const deleteTaskCommand = Command.make("delete", { id: flags.id }, (input) =>
  Effect.gen(function* () {
    yield* Task.deleteTask(input.id);
    yield* Console.table({ deleted: true, id: input.id });
  }),
).pipe(Command.withDescription("Delete task"));
