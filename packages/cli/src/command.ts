import { Command } from "effect/unstable/cli";
import { cloneCommand } from "./command/clone.command.ts";
import { workspaceCommand } from "./command/workspace/index.ts";
import { sessionCommand } from "./command/session/index.ts";
import { taskCommand } from "./command/task/index.ts";
import { ConsoleLayer, DryRun, DryRunLayer, Sandbox, Silent } from "./common/global-flags.ts";

export const rootCommand = Command.make("skipper").pipe(
  Command.withSubcommands([cloneCommand, workspaceCommand, sessionCommand, taskCommand]),
  Command.provide(() => ConsoleLayer),
  Command.provide(() => DryRunLayer),
  Command.withGlobalFlags([Silent, DryRun, Sandbox]),
);
