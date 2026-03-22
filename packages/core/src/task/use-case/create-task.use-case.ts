import { Effect } from "effect";
import { TaskService } from "../port/task.service";
import type { TaskCreate } from "../domain/task.model";

export const createTask = Effect.fn("task.create")(function* (data: TaskCreate) {
  const service = yield* TaskService;
  return yield* service.create(data);
});
