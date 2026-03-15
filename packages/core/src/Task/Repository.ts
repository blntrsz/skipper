import { Effect, Schema } from "effect";
import { SqlClient, SqlModel, SqlSchema } from "effect/unstable/sql";
import { Task } from "../domain/Task";

const BaseTaskRepository = SqlModel.makeRepository(Task, {
  idColumn: "id",
  tableName: "tasks",
  spanPrefix: "TaskRepository",
});

const findAllTasks = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Void,
    Result: Task,
    execute: () => sql`SELECT * FROM tasks`,
  });
});

const findTasksByRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return SqlSchema.findAll({
    Request: Schema.Struct({ repository: Schema.String }),
    Result: Task,
    execute: ({ repository }) => sql`SELECT * FROM tasks WHERE repository = ${repository}`,
  });
});

export const TaskRepository = Effect.gen(function* () {
  const repository = yield* BaseTaskRepository;
  const findAll = yield* findAllTasks;
  const findByRepository = yield* findTasksByRepository;

  return {
    ...repository,
    findAll: () => findAll(undefined),
    findByRepository: (repository: string) => findByRepository({ repository }),
  } as const;
});
