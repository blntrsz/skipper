import { Effect } from "effect";
import { TaskService } from "../port/task.service";

export const listTasks = Effect.fn("task.list")(function* () {
  const service = yield* TaskService;
  return yield* service.getAll();
});
