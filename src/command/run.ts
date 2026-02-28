import type { Command } from "commander";
import {
  assertNonEmpty,
  listDirectory,
  selectWithFzf,
} from "../shared/command/interactive.js";

/**
 * Register run command.
 *
 * @since 1.0.0
 * @category Worktree
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Pull changes and run opencode with a prompt")
    .argument("<prompt>", "The prompt to pass to opencode")
    .action(runCommand);
}

/**
 * Execute run command flow.
 *
 * @since 1.0.0
 * @category Worktree
 */
async function runCommand(prompt: string): Promise<void> {
  const baseDir = `${process.env.HOME}/.local/share/github`;
  const repoList = await listDirectory(baseDir);
  assertNonEmpty(repoList, "No repositories found in ~/.local/share/github");
  const repo = await selectWithFzf(repoList, "Select repository: ");
  if (!repo) {
    console.log("No repository selected");
    process.exit(0);
  }
  const repoPath = `${baseDir}/${repo}`;
  console.log(`Selected: ${repo}`);
  console.log("Pulling latest changes...");
  await Bun.$`git -C ${repoPath} pull`;
  console.log("Running opencode...");
  await Bun.$`opencode run ${prompt}`.cwd(repoPath);
}
