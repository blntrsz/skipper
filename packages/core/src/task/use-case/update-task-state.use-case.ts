import { Effect } from "effect";
import { TaskService } from "../port/task.service";
import type { TaskId, TaskState } from "../domain/task.model";

export const updateTaskState = Effect.fn("task.updateState")(function* (
  id: TaskId,
  state: TaskState,
) {
  const service = yield* TaskService;
  return yield* service.update(id, state);
});
