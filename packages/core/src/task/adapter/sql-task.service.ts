import { Effect, Layer } from "effect";
import { TaskService } from "../port/task.service";
import { TaskRepository } from "../port/task.repository";
import { make } from "../domain/task.model";

export const SqlTaskServiceLayer = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const repository = yield* TaskRepository;

    const create: TaskService["create"] = (data) =>
      Effect.gen(function* () {
        const task = yield* make(data);
        yield* repository.insertVoid(task);
        return task;
      });

    const get: TaskService["get"] = (id) => repository.findById(id);

    const getByRepository: TaskService["getByRepository"] = (repo) =>
      repository.findByRepository(repo);

    const getAll: TaskService["getAll"] = () => repository.findAll();

    const update: TaskService["update"] = (id, state) =>
      Effect.gen(function* () {
        const existing = yield* repository.findById(id);
        return yield* repository.update({
          ...existing,
          state,
          updatedAt: Date.now(),
        });
      });

    const del: TaskService["delete"] = (id) => repository.delete(id);

    return {
      create,
      get,
      getByRepository,
      getAll,
      update,
      delete: del,
    };
  }),
);
