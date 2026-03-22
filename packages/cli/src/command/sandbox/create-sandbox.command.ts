import { Workspace } from "@skippercorp/core";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, pickProject } from "./sandbox.common";

export const createSandboxCommand = Command.make("create", flags, (config) =>
  Effect.gen(function* () {
    const project = yield* pickProject(config.git, { branchMode: "new" });

    yield* Workspace.initWorkspace(project);
  }),
).pipe(Command.withAlias("c"), Command.withDescription("Create sandbox resources"));
