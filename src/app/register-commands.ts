import type { Command } from "commander";
import { registerCloneCommand } from "../command/clone.js";
import { registerAddCommand } from "../command/a.js";
import { registerRemoveCommand } from "../command/rm.js";
import { registerRunCommand } from "../command/run.js";
import { registerAwsCommand } from "../command/aws/index.js";
import { registerHelloCommand } from "../command/hello.js";

/**
 * Register all skipper commands.
 *
 * @since 1.0.0
 * @category CLI
 */
export function registerCommands(program: Command): void {
  registerHelloCommand(program);
  registerCloneCommand(program);
  registerAddCommand(program);
  registerRemoveCommand(program);
  registerRunCommand(program);
  registerAwsCommand(program);
}
