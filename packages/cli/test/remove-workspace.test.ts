/** @effect-diagnostics strictEffectProvide:off */
import {
  destroyWorkspace,
  FileSystemService,
  ProjectModel,
  ProjectService,
  SandboxService,
} from "@skippercorp/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

describe("workspace remove", () => {
  it.effect("removes selected branch worktree, not main repo", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({
        name: "skipper",
        branch: "testcreateandremove",
      });
      const mainProjectPath = "/repos/skipper";
      const branchPath = "/worktrees/skipper/skipper.testcreateandremove";
      const removeCommand = ChildProcess.make`git worktree remove ${branchPath}`;

      const calls = {
        branchPath: [] as Array<string>,
        detached: [] as Array<ProjectModel>,
        destroyed: [] as Array<ProjectModel>,
        executed: 0,
        sandboxDestroyed: 0,
      };

      yield* destroyWorkspace(project).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unused")),
        ),
        Effect.provideService(
          SandboxService,
          SandboxService.of({
            init: () => Effect.void,
            destroy: () => Effect.sync(() => void calls.sandboxDestroyed++),
            execute: () => Effect.sync(() => void calls.executed++),
            attach: () => Effect.void,
            detach: (project) => Effect.sync(() => void calls.detached.push(project)),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: () => Effect.die("unused"),
            init: () => Effect.void,
            destroy: (project) => Effect.sync(() => void calls.destroyed.push(project)),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.succeed(mainProjectPath),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.succeed(branchPath),
          }),
        ),
        Effect.provideService(
          ProjectService,
          ProjectService.of({
            clone: () => Effect.die("unused"),
            branch: () => Effect.die("unused"),
            removeBranch: (path) =>
              Effect.sync(() => {
                calls.branchPath.push(path);
                return removeCommand;
              }),
          }),
        ),
      );

      expect(calls.branchPath).toEqual([branchPath]);
      expect(calls.detached).toEqual([project]);
      expect(calls.destroyed).toEqual([project]);
      expect(calls.executed).toBe(1);
      expect(calls.sandboxDestroyed).toBe(1);
    }),
  );

  it.effect("skips git worktree removal for main repo", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({ name: "skipper" });

      const calls = {
        branchPath: [] as Array<string>,
        destroyed: [] as Array<ProjectModel>,
        executed: 0,
        detached: 0,
        sandboxDestroyed: 0,
      };

      yield* destroyWorkspace(project).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unused")),
        ),
        Effect.provideService(
          SandboxService,
          SandboxService.of({
            init: () => Effect.void,
            destroy: () => Effect.sync(() => void calls.sandboxDestroyed++),
            execute: () => Effect.sync(() => void calls.executed++),
            attach: () => Effect.void,
            detach: () => Effect.sync(() => void calls.detached++),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: () => Effect.die("unused"),
            init: () => Effect.void,
            destroy: (project) => Effect.sync(() => void calls.destroyed.push(project)),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.die("unused"),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.die("unused"),
          }),
        ),
        Effect.provideService(
          ProjectService,
          ProjectService.of({
            clone: () => Effect.die("unused"),
            branch: () => Effect.die("unused"),
            removeBranch: (path) =>
              Effect.sync(() => {
                calls.branchPath.push(path);
                return ChildProcess.make`git worktree remove ${path}`;
              }),
          }),
        ),
      );

      expect(calls.branchPath).toEqual([]);
      expect(calls.destroyed).toEqual([]);
      expect(calls.executed).toBe(0);
      expect(calls.detached).toBe(1);
      expect(calls.sandboxDestroyed).toBe(1);
    }),
  );
});
