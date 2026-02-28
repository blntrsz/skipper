import type { Command } from "commander";
import { registerWorkersSyncCommand } from "./sync.js";

/**
 * Register workers command namespace.
 *
 * @since 1.0.0
 * @category CLI
 */
export function registerWorkersCommand(program: Command): void {
  const workers = program.command("workers").description("Workers commands");
  registerWorkersSyncCommand(workers);
}
