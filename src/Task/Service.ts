import { Effect, Schema, ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";
import * as Task from "../domain/Task";
import { TaskRepository } from "./Repository";
import type { SchemaError } from "effect/Schema";
import { SqlClient, SqlResolver } from "effect/unstable/sql";
import type { NoSuchElementError } from "effect/Cause";

export const TaskService = ServiceMap.Service<{
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
}>("TaskService");

export const TaskServiceImpl = ServiceMap.make(TaskService, {
  create: (data: Task.TaskCreate) =>
    Effect.gen(function* () {
      const repository = yield* TaskRepository;

      const task = yield* Task.make(data);

      yield* repository.insertVoid(task);

      return task;
    }),

  get: (id: Task.TaskId) =>
    Effect.gen(function* () {
      const repository = yield* TaskRepository;

      return yield* repository.findById(id);
    }),

  getByRepository: (repository: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const resolver = SqlResolver.ordered({
        Request: Schema.String,
        Result: Schema.Array(Task.Task),
        execute: (requests) =>
          Effect.forEach(
            requests,
            (repository) =>
              sql`SELECT * FROM tasks WHERE repository = ${repository}`
          ),
      });

      return yield* SqlResolver.request(repository, resolver).pipe(
        Effect.catchTag("ResultLengthMismatch", () => Effect.succeed([]))
      );
    }),

  getAll: () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const resolver = SqlResolver.ordered({
        Request: Schema.Void,
        Result: Schema.Array(Task.Task),
        execute: (requests) =>
          sql`SELECT * FROM tasks`.pipe(
            Effect.map((tasks) => requests.map(() => tasks))
          ),
      });

      return yield* SqlResolver.request(undefined, resolver).pipe(
        Effect.catchTag("ResultLengthMismatch", () => Effect.succeed([]))
      );
    }),

  update: (id: Task.TaskId, state: Task.TaskState) =>
    Effect.gen(function* () {
      const repository = yield* TaskRepository;
      const existing = yield* repository.findById(id);

      return yield* repository.update({
        ...existing,
        state,
        updatedAt: Date.now(),
      });
    }),

  delete: (id: Task.TaskId) =>
    Effect.gen(function* () {
      const repository = yield* TaskRepository;

      yield* repository.delete(id);
    }),
});
