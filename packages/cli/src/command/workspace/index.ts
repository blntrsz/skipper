import { Command } from "effect/unstable/cli";
import { attachWorkspaceCommand } from "./attach-workspace.command";
import { createWorkspaceCommand } from "./create-workspace.command";
import { removeWorkspaceCommand } from "./remove-workspace.command";
import { runWorkspaceCommand } from "./run-workspace.command";

export const workspaceCommand = Command.make("workspace").pipe(
  Command.withAlias("w"),
  Command.withDescription("Manage workspaces"),
  Command.withSubcommands([
    attachWorkspaceCommand,
    createWorkspaceCommand,
    removeWorkspaceCommand,
    runWorkspaceCommand,
  ]),
);
