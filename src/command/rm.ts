import type { Command } from "commander";
import {
  assertNonEmpty,
  listDirectory,
  selectWithFzf,
} from "../shared/command/interactive.js";

type WorktreeRef = {
  repo: string;
  worktree: string;
  path: string;
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
    .action(runRemoveCommand);
}

/**
 * Execute remove command flow.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function runRemoveCommand(): Promise<void> {
  const worktreeBaseDir = `${process.env.HOME}/.local/share/skipper/worktree`;
  const allWorktrees = await collectWorktrees(worktreeBaseDir);
  assertNonEmpty(allWorktrees, "No worktrees found");
  const selected = await selectWorktree(allWorktrees);
  if (!selected) {
    console.log("No worktree selected");
    process.exit(0);
  }
  await removeWorktree(selected);
}

/**
 * Collect all worktrees under base path.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function collectWorktrees(worktreeBaseDir: string): Promise<WorktreeRef[]> {
  const repos = await listDirectory(worktreeBaseDir);
  if (repos.length === 0) {
    console.error("No worktrees found in ~/.local/share/skipper/worktree");
    process.exit(1);
  }
  const allWorktrees: WorktreeRef[] = [];
  for (const repo of repos) {
    const repoDir = `${worktreeBaseDir}/${repo}`;
    const worktrees = await listDirectory(repoDir);
    for (const worktree of worktrees) {
      allWorktrees.push({ repo, worktree, path: `${repoDir}/${worktree}` });
    }
  }
  return allWorktrees;
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
 * Remove worktree and tmux session.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function removeWorktree(target: WorktreeRef): Promise<void> {
  const githubDir = `${process.env.HOME}/.local/share/github`;
  const repoPath = `${githubDir}/${target.repo}`;
  const sessionName = `${target.repo}-${target.worktree}`;
  const name = `${target.repo}/${target.worktree}`;
  console.log(`Removing worktree: ${name}`);
  await removeGitWorktree(repoPath, target.path);
  await Bun.$`rm -rf ${target.path}`;
  if (await tmuxSessionExists(sessionName)) {
    await Bun.$`tmux kill-session -t ${sessionName}`;
    console.log(`Killed tmux session: ${sessionName}`);
  }
  console.log(`Removed worktree: ${name}`);
}

/**
 * Remove git worktree from repository.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function removeGitWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const result = await Bun.$`git -C ${repoPath} worktree remove ${worktreePath}`.nothrow();
  if (result.exitCode === 0) return;
  const stderr = result.stderr.toString().trim();
  const fallback = `git worktree remove failed with code ${result.exitCode}`;
  throw new Error(stderr || fallback);
}

/**
 * Check tmux session existence.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const output = await Bun.$`tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`.text();
  return output.trim() === "yes";
}
