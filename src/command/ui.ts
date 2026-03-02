import type { Command } from "commander";
import { printUiFallback } from "./ui/fallback.js";

/**
 * Register local dashboard UI command.
 *
 * @since 1.0.2
 * @category CLI
 */
export function registerUiCommand(program: Command): void {
  program
    .command("ui")
    .description("Open local worktree dashboard UI")
    .action(runUiCommand);
}

/**
 * Execute OpenTUI dashboard command.
 *
 * @since 1.0.2
 * @category CLI
 */
async function runUiCommand(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printUiFallback("`skipper ui` needs an interactive terminal");
    process.exit(1);
  }
  try {
    const { runUiTui } = await import("./ui/tui.js");
    await runUiTui();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printUiFallback(`UI failed to start: ${message}`);
    process.exit(1);
  }
}
