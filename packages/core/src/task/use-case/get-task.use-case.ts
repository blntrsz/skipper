import { Effect } from "effect";
import { TaskService } from "../port/task.service";
import type { TaskId } from "../domain/task.model";

export const getTask = Effect.fn("task.get")(function* (id: TaskId) {
  const service = yield* TaskService;
  return yield* service.get(id);
});
