import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import * as Task from "../domain/Task";
import { DatabaseLive, runMigrations } from "../internal/DatabaseService";
import { TaskService, TaskServiceImpl } from "./Service";

const taskStateChoices = [
  "stale",
  "working",
  "asking-question",
  "done",
] as const;

const idFlag = Flag.string("id").pipe(
  Flag.withSchema(Task.TaskId),
  Flag.withDescription("Task id")
);

const printJson = (value: unknown) =>
  Effect.sync(() => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  });

const withTaskDependencies = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* runMigrations;

    return yield* effect;
  }).pipe(Effect.provide(TaskServiceImpl), Effect.provide(DatabaseLive));

const createCommand = Command.make(
  "create",
  {
    description: Flag.string("description").pipe(
      Flag.withDescription("Task description")
    ),
    repository: Flag.string("repository").pipe(
      Flag.withDescription("Repository name")
    ),
    branch: Flag.string("branch").pipe(Flag.withDescription("Branch name")),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* TaskService;
      const task = yield* service.create({
        description: input.description,
        repository: input.repository,
        branch: input.branch,
      });

      yield* printJson(task);
    }).pipe(withTaskDependencies)
).pipe(Command.withDescription("Create task"));

const getCommand = Command.make("get", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const service = yield* TaskService;
    const task = yield* service.get(input.id);

    yield* printJson(task);
  }).pipe(withTaskDependencies)
).pipe(Command.withDescription("Get task by id"));

const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const service = yield* TaskService;
    const tasks = yield* service.getAll();

    yield* printJson(tasks);
  }).pipe(withTaskDependencies)
).pipe(Command.withDescription("List all tasks"));

const listByRepositoryCommand = Command.make(
  "list-by-repository",
  {
    repository: Flag.string("repository").pipe(
      Flag.withDescription("Repository name")
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* TaskService;
      const tasks = yield* service.getByRepository(input.repository);

      yield* printJson(tasks);
    }).pipe(withTaskDependencies)
).pipe(Command.withDescription("List tasks by repository"));

const updateStateCommand = Command.make(
  "update-state",
  {
    id: idFlag,
    state: Flag.choice("state", taskStateChoices).pipe(
      Flag.withDescription("Task state")
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const service = yield* TaskService;
      const task = yield* service.update(input.id, input.state);

      yield* printJson(task);
    }).pipe(withTaskDependencies)
).pipe(Command.withDescription("Update task state"));

const deleteCommand = Command.make("delete", { id: idFlag }, (input) =>
  Effect.gen(function* () {
    const service = yield* TaskService;

    yield* service.delete(input.id);
    yield* printJson({ deleted: true, id: input.id });
  }).pipe(withTaskDependencies)
).pipe(Command.withDescription("Delete task"));

export const TaskCli = Command.make("task").pipe(
  Command.withDescription("Manage tasks in sqlite db"),
  Command.withSubcommands([
    createCommand,
    getCommand,
    listCommand,
    listByRepositoryCommand,
    updateStateCommand,
    deleteCommand,
  ])
);
