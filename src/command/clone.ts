import type { Command } from "commander";

/**
 * Register clone command.
 *
 * @since 1.0.0
 * @category Worktree
 */
export function registerCloneCommand(program: Command): void {
  program
    .command("clone")
    .description("Clone a GitHub repository using SSH")
    .argument("<url>", "GitHub repository URL or owner/repo")
    .action(runClone);
}

/**
 * Execute clone command.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function runClone(url: string): Promise<void> {
  const repo = normalizeRepoInput(url);
  const targetDir = buildTargetDir(repo);
  await Bun.$`mkdir -p ${targetDir}`;
  await Bun.$`gh repo clone ${repo} ${targetDir} -- --recursive`;
}

/**
 * Normalize clone input to owner/repo.
 *
 * @since 1.0.0
 * @category Worktree
 */
function normalizeRepoInput(url: string): string {
  if (url.startsWith("https://github.com/")) {
    return parseRepo(url, /github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
  }
  if (url.startsWith("git@github.com:")) {
    return parseRepo(url, /github\.com:([^\/]+\/[^\/]+?)(?:\.git)?$/);
  }
  return url;
}

/**
 * Parse repo with regex fallback.
 *
 * @since 1.0.0
 * @category Worktree
 */
function parseRepo(url: string, matcher: RegExp): string {
  const match = url.match(matcher);
  return match?.[1] ?? url;
}

/**
 * Build clone target directory path.
 *
 * @since 1.0.0
 * @category Worktree
 */
function buildTargetDir(repo: string): string {
  const baseDir = `${process.env.HOME}/.local/share/github`;
  const repoName = repo.split("/")[1] ?? repo;
  return `${baseDir}/${repoName}`;
}
