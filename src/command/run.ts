import type { Command } from "commander";
import {
  assertNonEmpty,
  selectWithFzf,
} from "../shared/command/interactive.js";
import { createSkipperPaths, listRepos, runPromptInRepo } from "../worktree/service.js";

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
  const paths = createSkipperPaths();
  const repoList = await listRepos(paths);
  assertNonEmpty(repoList, "No repositories found in ~/.local/share/github");
  const repo = await selectWithFzf(repoList, "Select repository: ");
  if (!repo) {
    console.log("No repository selected");
    process.exit(0);
  }
  console.log(`Selected: ${repo}`);
  await runPromptInRepo(paths, repo, prompt);
}
