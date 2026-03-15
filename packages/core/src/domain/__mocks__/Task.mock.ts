import { faker } from "@faker-js/faker";
import { Task, TaskCreate, TaskId, TaskState } from "../Task.js";

const taskStates: TaskState[] = ["stale", "working", "asking-question", "done"];

export function createMockTask(overrides?: Partial<Task>): Task {
  const now = Date.now();

  return Task.makeUnsafe({
    id: TaskId.makeUnsafe(faker.string.ulid()),
    description: faker.lorem.sentence(),
    repository: faker.internet.url(),
    branch: faker.git.branch(),
    state: faker.helpers.arrayElement(taskStates),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function createMockTasks(count: number, overrides?: Partial<Task>): Task[] {
  return Array.from({ length: count }, () => createMockTask(overrides));
}

export function createMockTaskCreate(overrides?: Partial<TaskCreate>): TaskCreate {
  return {
    description: faker.lorem.sentence(),
    repository: faker.internet.url(),
    branch: faker.git.branch(),
    ...overrides,
  };
}
