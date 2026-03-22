import { type Effect, Schema, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { TaskModel, TaskId } from "../domain/task.model";

export interface TaskRepository {
  insertVoid: (task: TaskModel) => Effect.Effect<void, Schema.SchemaError | SqlError, never>;
  findById: (
    id: TaskId,
  ) => Effect.Effect<TaskModel, NoSuchElementError | Schema.SchemaError | SqlError, never>;
  findByRepository: (
    repository: string,
  ) => Effect.Effect<ReadonlyArray<TaskModel>, Schema.SchemaError | SqlError, never>;
  findAll: () => Effect.Effect<ReadonlyArray<TaskModel>, Schema.SchemaError | SqlError, never>;
  update: (task: TaskModel) => Effect.Effect<TaskModel, Schema.SchemaError | SqlError, never>;
  delete: (
    id: TaskId,
  ) => Effect.Effect<void, NoSuchElementError | Schema.SchemaError | SqlError, never>;
}

export const TaskRepository = ServiceMap.Service<TaskRepository>("TaskRepository");
