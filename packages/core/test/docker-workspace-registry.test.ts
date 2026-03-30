/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  DockerWorkspaceRegistryServiceLayer,
  ProjectModel,
  WorkspaceRegistryService,
} from "../src/workspace";

const makeSpawner = (outputs: Array<string>) => {
  let index = 0;

  return ChildProcessSpawner.make(() => {
    const stdout = outputs[index] ?? "";
    index++;

    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: {} as any,
        stdout: Stream.fromIterable([Buffer.from(stdout)]),
        stderr: Stream.empty,
        all: Stream.fromIterable([Buffer.from(stdout)]),
        getInputFd: () => Stream.empty as any,
        getOutputFd: () => Stream.empty,
      }),
    );
  });
};

describe("DockerWorkspaceRegistryService", () => {
  it.effect("lists Docker workspaces from labels and resolves handles", () =>
    Effect.gen(function* () {
      const registry = yield* WorkspaceRegistryService;
      const main = yield* registry.listMainProjects();
      const branches = yield* registry.listBranchProjects("skipper");
      const workspace = yield* registry.resolve(
        new ProjectModel({
          name: "skipper",
          branch: "feat/test",
        }),
      );

      expect(main).toEqual(["skipper"]);
      expect(branches).toEqual(["skipper.feat/test"]);
      expect(workspace.containerName).toBe("skipper-skipper-feat-test");
      expect(workspace.cwd).toBe("/workspace/skipper");
      expect(workspace.sandbox).toBe("docker");
    }).pipe(
      Effect.provide(DockerWorkspaceRegistryServiceLayer),
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        makeSpawner(["skipper\tmain\tmain\n", "skipper\tfeat/test\tbranch\n"]),
      ),
    ),
  );
});
