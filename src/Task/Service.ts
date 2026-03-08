import { Effect, Schema, ServiceMap } from "effect";
import * as Task from "../domain/Task";
import { TaskRepository } from "./Repository";
import { SqlClient, SqlResolver } from "effect/unstable/sql";
import { TaskService } from "./Port";

const create: TaskService["create"] = (data) =>
  Effect.gen(function* () {
    const repository = yield* TaskRepository;

    const task = yield* Task.make(data);

    yield* repository.insertVoid(task);

    return task;
  });

const get: TaskService["get"] = (id) =>
  Effect.gen(function* () {
    const repository = yield* TaskRepository;

    return yield* repository.findById(id);
  });

const getByRepository: TaskService["getByRepository"] = (repository) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const resolver = SqlResolver.ordered({
      Request: Schema.String,
      Result: Schema.Array(Task.Task),
      execute: (requests) =>
        Effect.forEach(
          requests,
          (repository) => sql`SELECT * FROM tasks WHERE repository = ${repository}`
        ),
    });

    return yield* SqlResolver.request(repository, resolver).pipe(
      Effect.catchTag("ResultLengthMismatch", () => Effect.succeed([]))
    );
  });

const getAll: TaskService["getAll"] = () =>
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
  });

const update: TaskService["update"] = (id, state) =>
  Effect.gen(function* () {
    const repository = yield* TaskRepository;
    const existing = yield* repository.findById(id);

    return yield* repository.update({
      ...existing,
      state,
      updatedAt: Date.now(),
    });
  });

const del: TaskService["delete"] = (id) =>
  Effect.gen(function* () {
    const repository = yield* TaskRepository;

    yield* repository.delete(id);
  });

export const TaskServiceImpl = ServiceMap.make(TaskService, {
  create,
  get,
  getByRepository,
  getAll,
  update,
  delete: del,
});
