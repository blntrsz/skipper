import type { Command } from "commander";
import {
  assertNonEmpty,
  selectOrQueryWithFzf,
  selectWithFzf,
} from "../shared/command/interactive.js";
import {
  addOrAttachWorktree,
  createSkipperPaths,
  ensureWorktreeDirectory,
  listRepos,
  listWorktreesForRepo,
  resolveWorktreeName,
  type SkipperPaths,
} from "../worktree/service.js";

type WorktreeSelection = {
  repo: string;
  worktree: string;
};

/**
 * Register add/attach worktree command.
 *
 * @since 1.0.0
 * @category Worktree
 */
export function registerAddCommand(program: Command): void {
  program
    .command("a")
    .description("Add/attach to a worktree in a repository")
    .action(runAddCommand);
}

/**
 * Execute add/attach flow.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function runAddCommand(): Promise<void> {
  const paths = createSkipperPaths();
  const selection = await selectWorktree(paths);
  await addOrAttachWorktree(paths, selection.repo, selection.worktree);
}

/**
 * Select repo and worktree names.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function selectWorktree(
  paths: SkipperPaths,
): Promise<WorktreeSelection> {
  const repoList = await listRepos(paths);
  assertNonEmpty(repoList, "No repositories found in ~/.local/share/github");
  const repo = await selectWithFzf(repoList, "Select repository: ");
  if (!repo) {
    console.log("No repository selected");
    process.exit(0);
  }

  await ensureWorktreeDirectory(paths, repo);
  const existingWorktrees = await listWorktreesForRepo(paths, repo);
  const input = await selectOrQueryWithFzf(
    existingWorktrees,
    existingWorktrees.length > 0
      ? "Select or type new worktree: "
      : "Enter new worktree name: ",
  );
  const worktree = resolveWorktreeName(input);
  if (!worktree) {
    console.log("No worktree selected or entered");
    process.exit(0);
  }

  return {
    repo,
    worktree,
  };
}
