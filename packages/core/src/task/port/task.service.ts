import { type Effect, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SchemaError } from "effect/Schema";
import type { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { Task, TaskCreate, TaskId, TaskState } from "../domain/task.model";

export interface TaskService {
  create: (data: TaskCreate) => Effect.Effect<Task, SqlError | SchemaError, SqlClient.SqlClient>;
  get: (
    id: TaskId,
  ) => Effect.Effect<Task, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
  getByRepository: (
    repo: string,
  ) => Effect.Effect<ReadonlyArray<Task>, SqlError | SchemaError, SqlClient.SqlClient>;
  getAll: () => Effect.Effect<ReadonlyArray<Task>, SqlError | SchemaError, SqlClient.SqlClient>;
  update: (
    id: TaskId,
    state: TaskState,
  ) => Effect.Effect<Task, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
  delete: (
    id: TaskId,
  ) => Effect.Effect<void, NoSuchElementError | SqlError | SchemaError, SqlClient.SqlClient>;
}

export const TaskService = ServiceMap.Service<TaskService>("TaskService");
