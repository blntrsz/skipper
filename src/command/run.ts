import type { Command } from "commander";

export function registerRunCommand(program: Command) {
  program
    .command("run")
    .description("Pull changes and run opencode with a prompt")
    .argument("<prompt>", "The prompt to pass to opencode")
    .action(async (prompt: string) => {
      const baseDir = `${process.env.HOME}/.local/share/github`;

      const repos = await Bun.$`ls -1 ${baseDir} 2>/dev/null || echo ""`.text();
      const repoList = repos.split("\n").filter((r) => r.trim() !== "");

      if (repoList.length === 0) {
        console.error("No repositories found in ~/.local/share/github");
        process.exit(1);
      }

      const selectedRepo =
        await Bun.$`echo ${repoList.join("\n")} | fzf --prompt="Select repository: "`
          .nothrow()
          .text();
      const repo = selectedRepo.trim();

      if (!repo) {
        console.log("No repository selected");
        process.exit(0);
      }

      const repoPath = `${baseDir}/${repo}`;

      console.log(`Selected: ${repo}`);
      console.log("Pulling latest changes...");
      await Bun.$`git -C ${repoPath} pull`.nothrow();

      console.log("Running opencode...");
      await Bun.$`opencode run ${prompt}`.cwd(repoPath);
    });
}
