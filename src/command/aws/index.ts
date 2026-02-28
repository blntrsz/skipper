import type { Command } from "commander";
import { registerAwsDeployCommand } from "./deploy.js";

export function registerAwsCommand(program: Command) {
  const aws = program.command("aws").description("AWS commands");
  registerAwsDeployCommand(aws);
}
