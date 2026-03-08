import { Effect, ServiceMap } from "effect";
import type { NoSuchElementError } from "effect/Cause";
import type { SchemaError } from "effect/Schema";
import type { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql/SqlError";
import * as Task from "../domain/Task";

export interface TaskService {
  create: (
    data: Task.TaskCreate
  ) => Effect.Effect<Task.Task, SqlError | SchemaError, SqlClient.SqlClient>;
  get: (
    id: Task.TaskId
  ) => Effect.Effect<
    Task.Task,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  getByRepository: (
    repo: string
  ) => Effect.Effect<
    ReadonlyArray<Task.Task>,
    SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  getAll: () => Effect.Effect<
    ReadonlyArray<Task.Task>,
    SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  update: (
    id: Task.TaskId,
    state: Task.TaskState
  ) => Effect.Effect<
    Task.Task,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
  delete: (
    id: Task.TaskId
  ) => Effect.Effect<
    void,
    NoSuchElementError | SqlError | SchemaError,
    SqlClient.SqlClient
  >;
}

export const TaskService = ServiceMap.Service<TaskService>("TaskService");
