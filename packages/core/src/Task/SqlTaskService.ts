import { Effect, ServiceMap } from "effect";
import { Task } from "../domain";
import { TaskRepository } from "./Repository";
import { TaskService } from "./TaskService";

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
    const taskRepository = yield* TaskRepository;
    return yield* taskRepository.findByRepository(repository);
  });

const getAll: TaskService["getAll"] = () =>
  Effect.gen(function* () {
    const taskRepository = yield* TaskRepository;
    return yield* taskRepository.findAll();
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

export const SqlTaskService = ServiceMap.make(TaskService, {
  create,
  get,
  getByRepository,
  getAll,
  update,
  delete: del,
});
