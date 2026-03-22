import { DateTime, Effect, Schema } from "effect";
import { Model } from "effect/unstable/schema";
import { ulid } from "ulid";

export const TaskId = Schema.String.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;

export const TaskState = Schema.Union([
  Schema.Literal("stale"),
  Schema.Literal("working"),
  Schema.Literal("asking-question"),
  Schema.Literal("done"),
]);
export type TaskState = typeof TaskState.Type;

export class TaskModel extends Model.Class<TaskModel>("Task")({
  id: Model.GeneratedByApp(TaskId),
  description: Schema.String,
  repository: Schema.String,
  branch: Schema.String,
  state: TaskState,
  createdAt: Model.GeneratedByApp(Schema.Number),
  updatedAt: Model.GeneratedByApp(Schema.Number),
}) {}

export const TaskCreate = Schema.Struct({
  description: Schema.String,
  repository: Schema.String,
  branch: Schema.String,
});
export type TaskCreate = typeof TaskCreate.Type;

export const make = Effect.fn("task.make")(function* (input: TaskCreate) {
  const now = yield* DateTime.now;

  return TaskModel.makeUnsafe({
    id: TaskId.makeUnsafe(ulid()),
    description: input.description,
    repository: input.repository,
    branch: input.branch,
    state: "stale",
    createdAt: DateTime.toEpochMillis(now),
    updatedAt: DateTime.toEpochMillis(now),
  });
});
