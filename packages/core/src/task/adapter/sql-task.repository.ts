import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlModel, SqlSchema } from "effect/unstable/sql";
import { Task } from "../domain/task.model";
import { TaskRepository } from "../port/task.repository";

export const SqlTaskRepositoryLayer = Layer.effect(
  TaskRepository,
  Effect.gen(function* () {
    const BaseTaskRepository = SqlModel.makeRepository(Task, {
      idColumn: "id",
      tableName: "tasks",
      spanPrefix: "TaskRepository",
    });

    const repository = yield* BaseTaskRepository;

    const sql = yield* SqlClient.SqlClient;

    const findAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Task,
      execute: () => sql`SELECT * FROM tasks`,
    });

    const findByRepository = SqlSchema.findAll({
      Request: Schema.Struct({ repository: Schema.String }),
      Result: Task,
      execute: ({ repository }) => sql`SELECT * FROM tasks WHERE repository = ${repository}`,
    });

    return {
      ...repository,
      findAll: () => findAll(undefined),
      findByRepository: (repository: string) => findByRepository({ repository }),
    } as const;
  }),
);
