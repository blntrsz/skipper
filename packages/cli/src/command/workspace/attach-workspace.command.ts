import { Workspace } from "@skippercorp/core";
import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { flags, pickProject } from "./workspace.common";
import { provideSandbox } from "../../common/sandbox";

export const attachWorkspaceCommand = Command.make(
  "attach",
  {
    ...flags,
    create: Flag.boolean("create").pipe(Flag.withDescription("Create workspace before attaching")),
  },
  (config) =>
    provideSandbox(
      config.sandbox,
      Effect.gen(function* () {
        const project = yield* pickProject(config.git, config.sandbox, {
          branchMode: config.create ? "new" : "existing",
        });

        if (config.create || project.isMain()) {
          yield* Workspace.initWorkspace(project);
        }

        yield* Workspace.attachWorkspace(project);
      }),
    ),
).pipe(Command.withAlias("a"), Command.withDescription("Attach to a workspace"));
