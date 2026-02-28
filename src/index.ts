#!/usr/bin/env bun
import { Command } from "commander";
import { registerCloneCommand } from "./command/clone.js";
import { registerAddCommand } from "./command/a.js";
import { registerRemoveCommand } from "./command/rm.js";
import { registerRunCommand } from "./command/run.js";
import { registerAwsCommand } from "./command/aws/index.js";

const program = new Command();

program.name("skipper").description("CLI tool").version("1.0.0");

program
  .command("hello")
  .description("Say hello")
  .argument("[name]", "name to greet")
  .action((name) => {
    console.log(`Hello ${name || "World"}!`);
  });

registerCloneCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerRunCommand(program);
registerAwsCommand(program);

program.parse();
