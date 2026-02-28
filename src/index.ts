#!/usr/bin/env bun
import { runCli } from "./app/cli.js";

/**
 * Process entrypoint.
 *
 * @since 1.0.0
 * @category CLI
 */
try {
  await runCli();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
