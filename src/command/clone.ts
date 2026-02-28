import type { Command } from "commander";

export function registerCloneCommand(program: Command) {
  program
    .command("clone")
    .description("Clone a GitHub repository using SSH")
    .argument("<url>", "GitHub repository URL or owner/repo")
    .action(async (url: string) => {
      let repo: string;

      if (url.startsWith("https://github.com/")) {
        const match = url.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
        repo = match ? match[1]! : url;
      } else if (url.startsWith("git@github.com:")) {
        const match = url.match(/github\.com:([^\/]+\/[^\/]+?)(?:\.git)?$/);
        repo = match ? match[1]! : url;
      } else {
        repo = url;
      }

      const baseDir = `${process.env.HOME}/.local/share/github`;
      const repoName = repo.split("/")[1];
      const targetDir = `${baseDir}/${repoName}`;

      await Bun.$`mkdir -p ${targetDir}`.nothrow();
      await Bun.$`gh repo clone ${repo} ${targetDir} -- --recursive`;
    });
}
