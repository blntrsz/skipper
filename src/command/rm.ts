import type { Command } from "commander";

export function registerRemoveCommand(program: Command) {
  program
    .command("rm")
    .description("Remove a worktree (repo+worktree)")
    .action(async () => {
      const worktreeBaseDir = `${process.env.HOME}/.local/share/skipper/worktree`;

      const repos =
        await Bun.$`ls -1 ${worktreeBaseDir} 2>/dev/null || echo ""`.text();
      const repoList = repos.split("\n").filter((r) => r.trim() !== "");

      if (repoList.length === 0) {
        console.error("No worktrees found in ~/.local/share/skipper/worktree");
        process.exit(1);
      }

      const allWorktrees: { repo: string; worktree: string; path: string }[] =
        [];

      for (const repo of repoList) {
        const repoDir = `${worktreeBaseDir}/${repo}`;
        const worktrees =
          await Bun.$`ls -1 ${repoDir} 2>/dev/null || echo ""`.text();
        const worktreeList = worktrees
          .split("\n")
          .filter((w) => w.trim() !== "");
        for (const worktree of worktreeList) {
          allWorktrees.push({
            repo,
            worktree,
            path: `${repoDir}/${worktree}`,
          });
        }
      }

      if (allWorktrees.length === 0) {
        console.error("No worktrees found");
        process.exit(1);
      }

      const options = allWorktrees.map((w) => `${w.repo}/${w.worktree}`);
      const selected =
        await Bun.$`echo ${options.join("\n")} | fzf --prompt="Select worktree to remove:`
          .nothrow()
          .text();

      if (!selected.trim()) {
        console.log("No worktree selected");
        process.exit(0);
      }

      const [name, targetWorktreePath] = selected.trim().split("|");
      const [repo, worktree] = name!.split("/");
      const githubDir = `${process.env.HOME}/.local/share/github`;
      const repoPath = `${githubDir}/${repo}`;
      const sessionName = `${repo}-${worktree}`;

      console.log(`Removing worktree: ${name}`);

      await Bun.$`git -C ${repoPath} worktree remove ${worktree} 2>/dev/null || true`.nothrow();

      await Bun.$`rm -rf ${targetWorktreePath}`.nothrow();

      const tmuxRunning =
        await Bun.$`tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`.text();
      if (tmuxRunning.trim() === "yes") {
        await Bun.$`tmux kill-session -t ${sessionName}`.nothrow();
        console.log(`Killed tmux session: ${sessionName}`);
      }

      console.log(`Removed worktree: ${name}`);
    });
}
