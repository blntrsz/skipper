import type { Command } from "commander";
import {
  assertNonEmpty,
  selectWithFzf,
} from "../shared/command/interactive.js";
import {
  collectWorktrees,
  createSkipperPaths,
  removeWorktree,
  type WorktreeRef,
} from "../worktree/service.js";

type RemoveCommandOptions = {
  force?: boolean;
};

/**
 * Register remove worktree command.
 *
 * @since 1.0.0
 * @category Worktree
 */
export function registerRemoveCommand(program: Command): void {
  program
    .command("rm")
    .description("Remove a worktree (repo+worktree)")
    .option(
      "-f, --force",
      "Force remove worktree with uncommitted changes (git worktree remove --force)",
    )
    .action(runRemoveCommand);
}

/**
 * Execute remove command flow.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function runRemoveCommand(options: RemoveCommandOptions = {}): Promise<void> {
  const force = options.force ?? true;
  const paths = createSkipperPaths();
  const allWorktrees = await collectWorktrees(paths);
  assertNonEmpty(allWorktrees, "No worktrees found");
  const selected = await selectWorktree(allWorktrees);
  if (!selected) {
    console.log("No worktree selected");
    process.exit(0);
  }
  await removeWorktree(paths, selected, force);
}

/**
 * Select worktree with fzf.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function selectWorktree(worktrees: WorktreeRef[]): Promise<WorktreeRef | undefined> {
  const labels = worktrees.map((item) => `${item.repo}/${item.worktree}`);
  const selected = await selectWithFzf(labels, "Select worktree to remove: ");
  const trimmed = selected?.trim();
  if (!trimmed) return undefined;
  return worktrees.find((item) => `${item.repo}/${item.worktree}` === trimmed);
}

/**
 * Build remove-git-worktree error message.
 *
 * @since 1.0.1
 * @category Worktree
 */
export function formatRemoveGitWorktreeError(
  stderr: string,
  exitCode: number,
  command = "git worktree remove",
): string {
  const trimmed = stderr.trim();
  if (trimmed.length > 0) return trimmed;
  return `${command} failed with code ${exitCode}`;
}
