import * as Task from "@skippercorp/core/task/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, printJson } from "./task.common";

export const updateTaskStateCommand = Command.make(
  "update-state",
  {
    id: flags.id,
    state: flags.state,
  },
  (input) =>
    Effect.gen(function* () {
      const task = yield* Task.updateTaskState(input.id, input.state);

      yield* printJson(task);
    }),
).pipe(Command.withDescription("Update task state"));
