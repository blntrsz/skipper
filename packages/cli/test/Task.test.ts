import { expect, it } from "@effect/vitest";
import { type Task, TaskService } from "@skippercorp/core";
import { createMockTaskCreate } from "@skippercorp/core/domain/__mocks__/Task.mock";
import { testLayer } from "@skippercorp/core/TestRuntime";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { TaskCli } from "../src/Task";
import { getStdOut } from "./TestUtils";
import { makeTestDatabaseLive } from "@skippercorp/core/internal/DatabaseService";

const runTaskCommand = Command.runWith(TaskCli, { version: "test" });

it.layer(testLayer)("TaskCli", (test) => {
  test.effect("create a task and output into stdout", () =>
    Effect.gen(function* () {
      const service = yield* TaskService;

      const task = createMockTaskCreate();

      yield* runTaskCommand([
        "create",
        "--description",
        task.description,
        "--repository",
        task.repository,
        "--branch",
        task.branch,
      ]);

      const created = yield* getStdOut<Task.Task>();

      expect(created).toMatchObject({
        ...task,
        id: expect.any(String),
        state: "stale",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });

      const persisted = yield* service.get(created.id);

      expect(persisted).toEqual(created);
    }).pipe(Effect.provide(makeTestDatabaseLive())),
  );

  test.effect("list tasks and output into stdout", () =>
    Effect.gen(function* () {
      const service = yield* TaskService;

      const first = yield* service.create(createMockTaskCreate());

      const second = yield* service.create(createMockTaskCreate());

      yield* runTaskCommand(["list"]);

      const listed = yield* getStdOut<ReadonlyArray<Task.Task>>();

      expect(listed).toHaveLength(2);
      expect(listed).toEqual(expect.arrayContaining([first, second]));
    }).pipe(Effect.provide(makeTestDatabaseLive())),
  );
});
