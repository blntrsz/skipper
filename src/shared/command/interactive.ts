import { Glob } from "bun";
import type { $ } from "bun";

const DIRECTORY_GLOB = new Glob("*");
const FZF_NO_MATCH_EXIT_CODE = 1;
const FZF_CANCELLED_EXIT_CODES = new Set([130]);

/**
 * List direct directory entries.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
export async function listDirectory(path: string): Promise<string[]> {
  try {
    const entries = await Array.fromAsync(
      DIRECTORY_GLOB.scan({ cwd: path, onlyFiles: false }),
    );
    return entries
      .filter((entry) => entry.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Exit when values list is empty.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
export function assertNonEmpty<T>(values: T[], message: string): void {
  if (values.length > 0) return;
  console.error(message);
  process.exit(1);
}

/**
 * Select one value with fzf.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
export async function selectWithFzf(
  values: string[],
  prompt: string,
): Promise<string | undefined> {
  const output = await runFzf(values, ["--prompt", prompt]);
  const trimmed = output?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Select one value or return typed query with fzf.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
export async function selectOrQueryWithFzf(
  values: string[],
  prompt: string,
): Promise<string | undefined> {
  const output = await runFzf(values, ["--prompt", prompt, "--print-query"]);
  if (!output) return undefined;
  return output.trim();
}

/**
 * Run fzf with values as stdin.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
async function runFzf(values: string[], args: string[]): Promise<string | undefined> {
  const input = values.join("\n");
  const result = await Bun.$`echo ${input} | fzf ${args}`.nothrow();
  const output = result.stdout.toString();
  if (result.exitCode === 0) {
    return output;
  }
  if (result.exitCode === FZF_NO_MATCH_EXIT_CODE) {
    if (output.trim().length > 0) return output;
    return undefined;
  }
  if (FZF_CANCELLED_EXIT_CODES.has(result.exitCode)) {
    return undefined;
  }
  throw new Error(`fzf failed: ${formatShellFailure(result)}`);
}

/**
 * Format shell output for error reporting.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
function formatShellFailure(result: $.ShellOutput): string {
  const stderr = result.stderr.toString().trim();
  if (stderr.length > 0) return stderr;
  const stdout = result.text().trim();
  if (stdout.length > 0) return stdout;
  return `exit code ${result.exitCode}`;
}

/**
 * Check if directory is missing.
 *
 * @since 1.0.0
 * @category Shared.Command
 */
function isMissingDirectoryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string };
  return maybe.code === "ENOENT" || maybe.code === "ENOTDIR";
}
