import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { flags } from "./task.common";

export const updateTaskStateCommand = Command.make(
  "update-state",
  {
    id: flags.id,
    state: flags.state,
  },
  (input) =>
    Effect.gen(function* () {
      const task = yield* Task.updateTaskState(input.id, input.state);

      yield* Console.table(task);
    }),
).pipe(Command.withDescription("Update task state"));
