import { Effect } from "effect";
import { TaskService } from "../port/task.service";
import type { TaskId } from "../domain/task.model";

export const deleteTask = Effect.fn("task.delete")(function* (id: TaskId) {
  const service = yield* TaskService;
  return yield* service.delete(id);
});
