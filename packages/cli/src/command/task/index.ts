import { Command } from "effect/unstable/cli";
import { createTaskCommand } from "./create-task.command";
import { getTaskCommand } from "./get-task.command";
import { listTasksCommand } from "./list-tasks.command";
import { listTasksByRepositoryCommand } from "./list-tasks-by-repository.command";
import { updateTaskStateCommand } from "./update-task-state.command";
import { deleteTaskCommand } from "./delete-task.command";

export const taskCommand = Command.make("task").pipe(
  Command.withAlias("t"),
  Command.withDescription("Manage tasks in sqlite db"),
  Command.withSubcommands([
    createTaskCommand,
    getTaskCommand,
    listTasksCommand,
    listTasksByRepositoryCommand,
    updateTaskStateCommand,
    deleteTaskCommand,
  ]),
);
