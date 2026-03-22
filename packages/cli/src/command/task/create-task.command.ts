import * as Task from "@skippercorp/core/task/use-case";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, printJson } from "./task.common";

export const createTaskCommand = Command.make(
  "create",
  {
    description: flags.description,
    repository: flags.repository,
    branch: flags.branch,
  },
  (input) =>
    Effect.gen(function* () {
      const task = yield* Task.createTask({
        description: input.description,
        repository: input.repository,
        branch: input.branch,
      });

      yield* printJson(task);
    }),
).pipe(Command.withDescription("Create task"));
