import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, pickProject } from "./workspace.common";
import { Workspace } from "@skippercorp/core";

export const removeWorkspaceCommand = Command.make("remove", flags, (config) =>
  Effect.gen(function* () {
    const project = yield* pickProject(config.git, { branchMode: "existing" });

    yield* Workspace.destroyWorkspace(project);
  }),
).pipe(Command.withAlias("rm"), Command.withDescription("Remove workspace resources"));
