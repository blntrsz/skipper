import { Effect } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { flags, pickProject } from "./workspace.common";
import { Workspace } from "@skippercorp/core";

const confirmForceRemoval = (project: Workspace.ProjectModel, error: Workspace.SandboxError) =>
  Prompt.run(
    Prompt.text({
      message: "Uncommitted changes detected. Force remove workspace? [y/n]",
      validate: (value) => {
        const answer = value.trim().toLowerCase();
        return answer === "y" || answer === "n"
          ? Effect.succeed(answer)
          : Effect.fail("Answer must be y or n");
      },
    }),
  ).pipe(
    Effect.flatMap((answer) =>
      answer === "y" ? Workspace.destroyWorkspace(project, true) : Effect.fail(error),
    ),
  );

export const removeWorkspaceCommand = Command.make(
  "remove",
  {
    ...flags,
    force: Flag.boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Force removal without confirmation"),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const project = yield* pickProject(config.git, { branchMode: "existing" });

      if (config.force) {
        return yield* Workspace.destroyWorkspace(project, true);
      }

      yield* Workspace.destroyWorkspace(project).pipe(
        Effect.catchTag("SandboxError", (error) =>
          error.reason === "UncommittedChanges"
            ? confirmForceRemoval(project, error)
            : Effect.fail(error),
        ),
      );
    }),
).pipe(Command.withAlias("rm"), Command.withDescription("Remove workspace resources"));
