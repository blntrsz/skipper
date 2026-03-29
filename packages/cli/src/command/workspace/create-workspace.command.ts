import { Workspace } from "@skippercorp/core";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { flags, pickProject } from "./workspace.common";
import { provideSandbox } from "../../common/sandbox";

export const createWorkspaceCommand = Command.make("create", flags, (config) =>
  provideSandbox(
    config.sandbox,
    Effect.gen(function* () {
      const project = yield* pickProject(config.git, config.sandbox, { branchMode: "new" });

      yield* Workspace.initWorkspace(project);
    }),
  ),
).pipe(Command.withAlias("c"), Command.withDescription("Create workspace resources"));
