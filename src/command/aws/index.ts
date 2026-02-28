import type { Command } from "commander";
import { registerAwsDeployCommand } from "./deploy.js";
import { registerAwsRunCommand } from "./run.js";

/**
 * Register AWS command namespace.
 *
 * @since 1.0.0
 * @category CLI
 */
export function registerAwsCommand(program: Command) {
  const aws = program.command("aws").description("AWS commands");
  registerAwsDeployCommand(aws);
  registerAwsRunCommand(aws);
}
