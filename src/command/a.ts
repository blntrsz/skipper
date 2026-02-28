import type { Command } from "commander";
import {
  assertNonEmpty,
  listDirectory,
  selectOrQueryWithFzf,
  selectWithFzf,
} from "../shared/command/interactive.js";

type WorktreeSelection = {
  repo: string;
  worktree: string;
  targetWorktreePath: string;
  repoPath: string;
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
  const githubDir = `${process.env.HOME}/.local/share/github`;
  const worktreeBaseDir = `${process.env.HOME}/.local/share/skipper/worktree`;
  const selection = await selectWorktree(githubDir, worktreeBaseDir);
  await ensureWorktreeExists(selection);
  await attachOrStartTmux(selection);
}

/**
 * Select repo and worktree names.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function selectWorktree(
  githubDir: string,
  worktreeBaseDir: string,
): Promise<WorktreeSelection> {
  const repoList = await listDirectory(githubDir);
  assertNonEmpty(repoList, "No repositories found in ~/.local/share/github");
  const repo = await selectWithFzf(repoList, "Select repository: ");
  if (!repo) {
    console.log("No repository selected");
    process.exit(0);
  }

  const worktreeDir = `${worktreeBaseDir}/${repo}`;
  await Bun.$`mkdir -p ${worktreeDir}`;
  const existingWorktrees = await listDirectory(worktreeDir);
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
    targetWorktreePath: `${worktreeDir}/${worktree}`,
    repoPath: `${githubDir}/${repo}`,
  };
}

/**
 * Ensure selected worktree exists.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function ensureWorktreeExists(selection: WorktreeSelection): Promise<void> {
  const exists = await directoryExists(selection.targetWorktreePath);
  if (exists) {
    console.log(`Attaching to existing worktree: ${selection.targetWorktreePath}`);
    return;
  }

  console.log(`Creating new worktree: ${selection.worktree}`);
  const branchExists = await gitBranchExists(selection.repoPath, selection.worktree);
  if (branchExists) {
    await Bun.$`git -C ${selection.repoPath} worktree add ${selection.targetWorktreePath} ${selection.worktree}`;
    return;
  }
  await Bun.$`git -C ${selection.repoPath} worktree add ${selection.targetWorktreePath} -b ${selection.worktree}`;
}

/**
 * Attach to existing tmux session or create one.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function attachOrStartTmux(selection: WorktreeSelection): Promise<void> {
  const sessionName = `${selection.repo}-${selection.worktree}`;
  const running = await tmuxSessionExists(sessionName);
  const inTmux = process.env.TMUX !== undefined;
  if (running) {
    await switchOrAttachSession(sessionName, inTmux);
    return;
  }
  await createTmuxSession(sessionName, selection.targetWorktreePath, inTmux);
}

/**
 * Resolve typed or selected worktree name.
 *
 * @since 1.0.0
 * @category Worktree
 */
function resolveWorktreeName(worktreeInput: string | undefined): string | undefined {
  if (!worktreeInput) return undefined;
  const lines = worktreeInput.trim().split("\n");
  const query = lines[0] || "";
  const selection = lines[1] || "";
  if (selection && selection !== "[new]") {
    return selection;
  }
  if (query) {
    return query;
  }
  return undefined;
}

/**
 * Check whether directory exists.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function directoryExists(path: string): Promise<boolean> {
  const result = await Bun.$`test -d ${path} && echo "yes" || echo "no"`.text();
  return result.trim() === "yes";
}

/**
 * Check whether git branch exists.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function gitBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const ref = `refs/heads/${branch}`;
  const result = await Bun.$`git -C ${repoPath} show-ref --verify --quiet ${ref}`.nothrow();
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  const stderr = result.stderr.toString().trim();
  throw new Error(stderr || `git show-ref failed with code ${result.exitCode}`);
}

/**
 * Check whether tmux session exists.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const output = await Bun.$`tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`.text();
  return output.trim() === "yes";
}

/**
 * Switch or attach to tmux session.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function switchOrAttachSession(sessionName: string, inTmux: boolean): Promise<void> {
  if (inTmux) {
    console.log(`Switching to tmux session: ${sessionName}`);
    await Bun.$`tmux switch-client -t ${sessionName}`;
    return;
  }
  console.log(`Attaching to existing tmux session: ${sessionName}`);
  await Bun.$`tmux attach-session -t ${sessionName}`;
}

/**
 * Create tmux session and attach/switch.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function createTmuxSession(
  sessionName: string,
  worktreePath: string,
  inTmux: boolean,
): Promise<void> {
  console.log(`Starting new tmux session: ${sessionName}`);
  if (inTmux) {
    await Bun.$`tmux new-session -s ${sessionName} -c ${worktreePath} -d && tmux switch-client -t ${sessionName}`;
    return;
  }
  await Bun.$`tmux new-session -s ${sessionName} -c ${worktreePath}`;
}
