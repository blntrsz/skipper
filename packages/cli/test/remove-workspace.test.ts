/** @effect-diagnostics strictEffectProvide:off */
import {
  destroyWorkspace,
  FileSystemService,
  ProjectModel,
  type SandboxDestroyInput,
  type SandboxInitInput,
  SandboxService,
} from "@skippercorp/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

describe("workspace remove", () => {
  it.effect("removes selected branch worktree, not main repo", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({
        name: "skipper",
        branch: "testcreateandremove",
      });
      const mainProjectPath = "/repos/skipper";
      const branchPath = "/worktrees/skipper/skipper.testcreateandremove";

      const calls = {
        destroyInputs: [] as Array<SandboxDestroyInput>,
        detached: [] as Array<ProjectModel>,
        destroyed: [] as Array<ProjectModel>,
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
            init: (_input: SandboxInitInput) => Effect.void,
            destroy: (input) =>
              Effect.sync(() => {
                calls.destroyInputs.push(input);
                calls.sandboxDestroyed++;
              }),
            execute: () => Effect.die("unused"),
            attach: () => Effect.void,
            detach: (project) => Effect.sync(() => void calls.detached.push(project)),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.die("unused"),
            init: () => Effect.void,
            destroy: (project) => Effect.sync(() => void calls.destroyed.push(project)),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.succeed(mainProjectPath),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.succeed(branchPath),
          }),
        ),
      );

      expect(calls.destroyInputs).toEqual([
        {
          project,
          mainProjectPath,
          branchPath,
        },
      ]);
      expect(calls.detached).toEqual([project]);
      expect(calls.destroyed).toEqual([project]);
      expect(calls.sandboxDestroyed).toBe(1);
    }),
  );

  it.effect("skips git worktree removal for main repo", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({ name: "skipper" });

      const calls = {
        destroyInputs: [] as Array<SandboxDestroyInput>,
        destroyed: [] as Array<ProjectModel>,
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
            init: (_input: SandboxInitInput) => Effect.void,
            destroy: (input) =>
              Effect.sync(() => {
                calls.destroyInputs.push(input);
                calls.sandboxDestroyed++;
              }),
            execute: () => Effect.die("unused"),
            attach: () => Effect.void,
            detach: () => Effect.sync(() => void calls.detached++),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.die("unused"),
            init: () => Effect.void,
            destroy: (project) => Effect.sync(() => void calls.destroyed.push(project)),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.die("unused"),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.die("unused"),
          }),
        ),
      );

      expect(calls.destroyInputs).toEqual([{ project }]);
      expect(calls.destroyed).toEqual([]);
      expect(calls.detached).toBe(1);
      expect(calls.sandboxDestroyed).toBe(1);
    }),
  );

  it.effect("still removes branch folder after sandbox worktree teardown", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({
        name: "skipper",
        branch: "switch-command",
      });
      const mainProjectPath = "/repos/skipper";
      const branchPath = "/worktrees/skipper/skipper.switch-command";

      const calls = {
        destroyInputs: [] as Array<SandboxDestroyInput>,
        detached: [] as Array<ProjectModel>,
        destroyed: [] as Array<ProjectModel>,
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
            init: (_input: SandboxInitInput) => Effect.void,
            destroy: (input) =>
              Effect.sync(() => {
                calls.destroyInputs.push(input);
                calls.sandboxDestroyed++;
              }),
            execute: () => Effect.die("unused"),
            attach: () => Effect.void,
            detach: (project) => Effect.sync(() => void calls.detached.push(project)),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.die("unused"),
            init: () => Effect.void,
            destroy: (project) => Effect.sync(() => void calls.destroyed.push(project)),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.succeed(mainProjectPath),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.succeed(branchPath),
          }),
        ),
      );

      expect(calls.destroyInputs).toEqual([
        {
          project,
          mainProjectPath,
          branchPath,
        },
      ]);
      expect(calls.detached).toEqual([project]);
      expect(calls.destroyed).toEqual([project]);
      expect(calls.sandboxDestroyed).toBe(1);
    }),
  );

  it.effect("passes force to sandbox destroy when requested", () =>
    Effect.gen(function* () {
      const project = new ProjectModel({
        name: "skipper",
        branch: "force-remove",
      });
      const mainProjectPath = "/repos/skipper";
      const branchPath = "/worktrees/skipper/skipper.force-remove";

      const calls = {
        destroyInputs: [] as Array<SandboxDestroyInput>,
      };

      yield* destroyWorkspace(project, true).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unused")),
        ),
        Effect.provideService(
          SandboxService,
          SandboxService.of({
            init: (_input: SandboxInitInput) => Effect.void,
            destroy: (input) =>
              Effect.sync(() => {
                calls.destroyInputs.push(input);
              }),
            execute: () => Effect.die("unused"),
            attach: () => Effect.void,
            detach: () => Effect.void,
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.die("unused"),
            init: () => Effect.void,
            destroy: () => Effect.void,
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: () => Effect.succeed(mainProjectPath),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.succeed(branchPath),
          }),
        ),
      );

      expect(calls.destroyInputs).toEqual([
        {
          project,
          mainProjectPath,
          branchPath,
          force: true,
        },
      ]);
    }),
  );
});
