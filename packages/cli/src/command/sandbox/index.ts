import { Command } from "effect/unstable/cli";
import { attachSandboxCommand } from "./attach-sandbox.command";
import { createSandboxCommand } from "./create-sandbox.command";
import { removeSandboxCommand } from "./remove-sandbox.command";
import { runSandboxCommand } from "./run-sandbox.command";

export const sandboxCommand = Command.make("sandbox").pipe(
  Command.withAlias("s"),
  Command.withDescription("Manage sandboxes"),
  Command.withSubcommands([
    attachSandboxCommand,
    createSandboxCommand,
    removeSandboxCommand,
    runSandboxCommand,
  ]),
);
