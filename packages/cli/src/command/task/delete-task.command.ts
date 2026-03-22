import * as Task from "@skippercorp/core/task/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, printJson } from "./task.common";

export const deleteTaskCommand = Command.make("delete", { id: flags.id }, (input) =>
  Effect.gen(function* () {
    yield* Task.deleteTask(input.id);
    yield* printJson({ deleted: true, id: input.id });
  }),
).pipe(Command.withDescription("Delete task"));
