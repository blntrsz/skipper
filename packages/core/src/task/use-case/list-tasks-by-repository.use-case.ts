import { Effect } from "effect";
import { TaskService } from "../port/task.service";

export const listTasksByRepository = Effect.fn("task.listByRepository")(function* (
  repository: string,
) {
  const service = yield* TaskService;
  return yield* service.getByRepository(repository);
});
