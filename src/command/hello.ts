import type { Command } from "commander";

/**
 * Build greeting message for given name.
 *
 * @since 1.0.0
 * @category CLI
 */
export function buildGreeting(name?: string): string {
  return `Hello ${name || "World"}!`;
}

/**
 * Register hello command.
 *
 * @since 1.0.0
 * @category CLI
 */
export function registerHelloCommand(program: Command): void {
  program
    .command("hello")
    .description("Say hello")
    .argument("[name]", "name to greet")
    .action((name) => {
      console.log(buildGreeting(name));
    });
}
