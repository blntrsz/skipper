import { Workspace } from "@skippercorp/core";
import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { flags, pickProject } from "./sandbox.common";

export const attachSandboxCommand = Command.make(
  "attach",
  {
    ...flags,
    create: Flag.boolean("create").pipe(Flag.withDescription("Create workspace before attaching")),
  },
  (config) =>
    Effect.gen(function* () {
      const project = yield* pickProject(config.git, {
        branchMode: config.create ? "new" : "existing",
      });

      if (config.create) {
        yield* Workspace.initWorkspace(project);
      }

      yield* Workspace.attachWorkspace(project);
    }),
).pipe(Command.withAlias("a"), Command.withDescription("Attach to a sandbox workspace"));
