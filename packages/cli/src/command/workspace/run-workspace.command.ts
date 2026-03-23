import { Workspace } from "@skippercorp/core";
import { Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { flags, pickProject } from "./workspace.common";

export const runWorkspaceCommand = Command.make(
  "run",
  {
    ...flags,
    command: Flag.optional(
      Flag.string("command").pipe(Flag.withAlias("cmd"), Flag.withDescription("Bash command")),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const project = yield* pickProject(config.git, { branchMode: "existing" });

      const command = yield* Option.match(config.command, {
        onSome: (value) => Effect.succeed(value),
        onNone: () =>
          Prompt.run(
            Prompt.text({
              message: "Command",
              validate: (value) =>
                value.trim().length > 0
                  ? Effect.succeed(value)
                  : Effect.fail("Command is required"),
            }),
          ),
      });

      yield* Workspace.runCommandInWorkspace(project, command);
    }),
).pipe(Command.withAlias("r"), Command.withDescription("Run a command in a workspace"));
