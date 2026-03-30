/** @effect-diagnostics strictEffectProvide:off */
import {
  FileSystemService,
  initWorkspace,
  ProjectModel,
  type SandboxInitInput,
  SandboxService,
} from "@skippercorp/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { parseGithubSshRemote } from "../src/command/clone.command.ts";

describe("clone command", () => {
  it("parses github ssh remote", () => {
    expect(parseGithubSshRemote("git@github.com:blntrsz/skipper.git")).toEqual({
      namespace: "blntrsz",
      name: "skipper",
    });
  });

  it("rejects invalid github ssh remote", () => {
    expect(() => parseGithubSshRemote("owner/repo")).toThrow(
      "Expected GitHub SSH remote like git@github.com:owner/repo.git",
    );
  });

  it.effect("inits workspace with parsed project", () =>
    Effect.gen(function* () {
      let initInput: SandboxInitInput | undefined;

      yield* initWorkspace(
        new ProjectModel(parseGithubSshRemote("git@github.com:blntrsz/skipper.git")),
      ).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unused")),
        ),
        Effect.provideService(
          SandboxService,
          SandboxService.of({
            init: (input) =>
              Effect.sync(() => {
                initInput = input;
              }),
            destroy: () => Effect.die("unused"),
            execute: () => Effect.die("unused"),
            attach: () => Effect.die("unused"),
            detach: () => Effect.die("unused"),
          }),
        ),
        Effect.provideService(
          FileSystemService,
          FileSystemService.of({
            fs: Effect.succeed({ exists: () => Effect.succeed(false) } as any),
            init: () => Effect.void,
            destroy: () => Effect.die("unused"),
            rootCwd: () => Effect.die("unused"),
            mainCwd: () => Effect.die("unused"),
            mainProjectCwd: (_project: ProjectModel) => Effect.succeed("/repos/skipper"),
            branchCwd: () => Effect.die("unused"),
            branchProjectCwd: () => Effect.die("unused"),
          }),
        ),
      );

      expect(initInput?.project).toBeInstanceOf(ProjectModel);
      expect(initInput?.project.namespace).toBe("blntrsz");
      expect(initInput?.project.name).toBe("skipper");
      expect(initInput?.project.branch).toBeUndefined();
      expect(initInput?.mainProjectPath).toBe("/repos/skipper");
      expect(initInput?.mainExists).toBe(false);
      expect(initInput?.branchPath).toBeUndefined();
    }),
  );
});
