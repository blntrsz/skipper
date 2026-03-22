import * as Task from "@skippercorp/core/task/use-case";
import { Effect, Console } from "effect";
import { Command } from "effect/unstable/cli";
import { flags } from "./task.common";

export const createTaskCommand = Command.make(
  "create",
  {
    description: flags.description,
    repository: flags.repository,
    branch: flags.branch,
  },
  (input) =>
    Effect.gen(function* () {
      const task = yield* Task.createTask(input);

      yield* Console.table(task);
    }),
).pipe(Command.withAlias("c"), Command.withDescription("Create task"));
