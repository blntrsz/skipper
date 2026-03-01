import { Command } from "commander";
import packageJson from "../../package.json";
import { registerCommands } from "./register-commands.js";

const packageVersion =
  typeof packageJson.version === "string" && packageJson.version.length > 0
    ? packageJson.version
    : "0.0.0";

/**
 * Build configured CLI program.
 *
 * @since 1.0.0
 * @category CLI
 */
export function createProgram(): Command {
  const program = new Command();
  program.name("skipper").description("CLI tool").version(packageVersion);
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
