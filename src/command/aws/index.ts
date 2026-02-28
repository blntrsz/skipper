import type { Command } from "commander";
import { registerAwsBootstrapCommand } from "./bootstrap.js";
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
  registerAwsBootstrapCommand(aws);
  registerAwsDeployCommand(aws);
  registerAwsRunCommand(aws);
}
