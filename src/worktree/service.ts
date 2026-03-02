import { listDirectory } from "../shared/command/interactive.js";

export type SkipperPaths = {
  githubDir: string;
  worktreeBaseDir: string;
};

export type WorktreeRef = {
  repo: string;
  worktree: string;
  path: string;
};

export type AddOrAttachOutcome = {
  createdWorktree: boolean;
  sessionName: string;
};

/**
 * Build default local paths used by skipper worktree commands.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function createSkipperPaths(): SkipperPaths {
  const homeDir = process.env.HOME ?? "";
  return {
    githubDir: `${homeDir}/.local/share/github`,
    worktreeBaseDir: `${homeDir}/.local/share/skipper/worktree`,
  };
}

/**
 * Build canonical tmux session name for one worktree.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function buildSessionName(repo: string, worktree: string): string {
  return `${repo}-${worktree}`;
}

/**
 * Build absolute repository path for one repo name.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function buildRepoPath(paths: SkipperPaths, repo: string): string {
  return `${paths.githubDir}/${repo}`;
}

/**
 * Build absolute worktree directory path for one repo.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function buildWorktreeDir(paths: SkipperPaths, repo: string): string {
  return `${paths.worktreeBaseDir}/${repo}`;
}

/**
 * Build absolute worktree path from repo and worktree names.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function buildWorktreePath(
  paths: SkipperPaths,
  repo: string,
  worktree: string,
): string {
  return `${buildWorktreeDir(paths, repo)}/${worktree}`;
}

/**
 * List local repositories from configured github directory.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function listRepos(paths: SkipperPaths): Promise<string[]> {
  return listDirectory(paths.githubDir);
}

/**
 * Ensure worktree directory exists for a repository.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function ensureWorktreeDirectory(
  paths: SkipperPaths,
  repo: string,
): Promise<string> {
  const dir = buildWorktreeDir(paths, repo);
  await Bun.$`mkdir -p ${dir}`;
  return dir;
}

/**
 * List worktrees for one repository.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function listWorktreesForRepo(
  paths: SkipperPaths,
  repo: string,
): Promise<string[]> {
  const worktreeDir = buildWorktreeDir(paths, repo);
  return listDirectory(worktreeDir);
}

/**
 * Collect all local worktrees across all repositories.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function collectWorktrees(paths: SkipperPaths): Promise<WorktreeRef[]> {
  const repos = await listDirectory(paths.worktreeBaseDir);
  const allWorktrees: WorktreeRef[] = [];
  for (const repo of repos) {
    const repoDir = `${paths.worktreeBaseDir}/${repo}`;
    const worktrees = await listDirectory(repoDir);
    for (const worktree of worktrees) {
      allWorktrees.push({ repo, worktree, path: `${repoDir}/${worktree}` });
    }
  }
  return allWorktrees;
}

/**
 * Resolve typed or selected worktree value from fzf --print-query output.
 *
 * @since 1.0.2
 * @category Worktree
 */
export function resolveWorktreeName(worktreeInput: string | undefined): string | undefined {
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
 * Ensure one worktree exists and attach/switch tmux session.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function addOrAttachWorktree(
  paths: SkipperPaths,
  repo: string,
  worktree: string,
): Promise<AddOrAttachOutcome> {
  const repoPath = buildRepoPath(paths, repo);
  const targetWorktreePath = buildWorktreePath(paths, repo, worktree);
  const createdWorktree = await ensureWorktreeExists(repoPath, worktree, targetWorktreePath);
  const sessionName = buildSessionName(repo, worktree);
  await attachOrStartTmux(sessionName, targetWorktreePath);
  return { createdWorktree, sessionName };
}

/**
 * Remove one worktree and kill matching tmux session.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function removeWorktree(
  paths: SkipperPaths,
  target: WorktreeRef,
  force = true,
): Promise<void> {
  const repoPath = buildRepoPath(paths, target.repo);
  const sessionName = buildSessionName(target.repo, target.worktree);
  const name = `${target.repo}/${target.worktree}`;
  console.log(`Removing worktree: ${name}`);
  await removeGitWorktree(repoPath, target.path, force);
  await Bun.$`rm -rf ${target.path}`;
  if (await tmuxSessionExists(sessionName)) {
    await Bun.$`tmux kill-session -t ${sessionName}`;
    console.log(`Killed tmux session: ${sessionName}`);
  }
  console.log(`Removed worktree: ${name}`);
}

/**
 * Pull latest repository changes and run opencode prompt.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function runPromptInRepo(
  paths: SkipperPaths,
  repo: string,
  prompt: string,
): Promise<void> {
  const repoPath = buildRepoPath(paths, repo);
  console.log("Pulling latest changes...");
  await Bun.$`git -C ${repoPath} pull`;
  console.log("Running opencode...");
  await Bun.$`opencode run ${prompt}`.cwd(repoPath);
}

/**
 * Check whether tmux session exists.
 *
 * @since 1.0.2
 * @category Worktree
 */
export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const output = await Bun.$`tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`.text();
  return output.trim() === "yes";
}

/**
 * Ensure worktree directory exists with branch handling.
 *
 * @since 1.0.2
 * @category Worktree
 */
async function ensureWorktreeExists(
  repoPath: string,
  worktree: string,
  targetWorktreePath: string,
): Promise<boolean> {
  const exists = await directoryExists(targetWorktreePath);
  if (exists) {
    console.log(`Attaching to existing worktree: ${targetWorktreePath}`);
    return false;
  }
  console.log(`Creating new worktree: ${worktree}`);
  const branchExists = await gitBranchExists(repoPath, worktree);
  if (branchExists) {
    await Bun.$`git -C ${repoPath} worktree add ${targetWorktreePath} ${worktree}`;
    return true;
  }
  await Bun.$`git -C ${repoPath} worktree add ${targetWorktreePath} -b ${worktree}`;
  return true;
}

/**
 * Attach to an existing tmux session or create one.
 *
 * @since 1.0.2
 * @category Worktree
 */
async function attachOrStartTmux(sessionName: string, worktreePath: string): Promise<void> {
  const running = await tmuxSessionExists(sessionName);
  const inTmux = process.env.TMUX !== undefined;
  if (running) {
    await switchOrAttachSession(sessionName, inTmux);
    return;
  }
  await createTmuxSession(sessionName, worktreePath, inTmux);
}

/**
 * Check whether directory exists.
 *
 * @since 1.0.2
 * @category Worktree
 */
async function directoryExists(path: string): Promise<boolean> {
  const result = await Bun.$`test -d ${path} && echo "yes" || echo "no"`.text();
  return result.trim() === "yes";
}

/**
 * Check whether git branch exists.
 *
 * @since 1.0.2
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
 * Switch or attach to tmux session.
 *
 * @since 1.0.2
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
 * @since 1.0.2
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

/**
 * Remove git worktree from repository.
 *
 * @since 1.0.2
 * @category Worktree
 */
async function removeGitWorktree(
  repoPath: string,
  worktreePath: string,
  force: boolean,
): Promise<void> {
  const result = force
    ? await Bun.$`git -C ${repoPath} worktree remove --force ${worktreePath}`.nothrow()
    : await Bun.$`git -C ${repoPath} worktree remove ${worktreePath}`.nothrow();
  if (result.exitCode === 0) return;
  const command = force ? "git worktree remove --force" : "git worktree remove";
  throw new Error(
    formatRemoveGitWorktreeError(result.stderr.toString(), result.exitCode, command),
  );
}

/**
 * Build remove-git-worktree error message.
 *
 * @since 1.0.2
 * @category Worktree
 */
function formatRemoveGitWorktreeError(
  stderr: string,
  exitCode: number,
  command = "git worktree remove",
): string {
  const trimmed = stderr.trim();
  if (trimmed.length > 0) return trimmed;
  return `${command} failed with code ${exitCode}`;
}
