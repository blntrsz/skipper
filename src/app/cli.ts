import { Command } from "commander";
import { registerCommands } from "./register-commands.js";

/**
 * Build configured CLI program.
 *
 * @since 1.0.0
 * @category CLI
 */
export function createProgram(): Command {
  const program = new Command();
  program.name("skipper").description("CLI tool").version("1.0.0");
  registerCommands(program);
  return program;
}

/**
 * Run CLI program with argv.
 *
 * @since 1.0.0
 * @category CLI
 */
export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}
