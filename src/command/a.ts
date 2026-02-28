import type { Command } from "commander";

export function registerAddCommand(program: Command) {
  program
    .command("a")
    .description("Add/attach to a worktree in a repository")
    .action(async () => {
      const githubDir = `${process.env.HOME}/.local/share/github`;
      const worktreeBaseDir = `${process.env.HOME}/.local/share/skipper/worktree`;

      const repos =
        await Bun.$`ls -1 ${githubDir} 2>/dev/null || echo ""`.text();
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

      const worktreeDir = `${worktreeBaseDir}/${repo}`;
      await Bun.$`mkdir -p ${worktreeDir}`.nothrow();

      const existingWorktrees =
        await Bun.$`ls -1 ${worktreeDir} 2>/dev/null || echo ""`.text();
      const worktreeList = existingWorktrees
        .split("\n")
        .filter((w) => w.trim() !== "");

      let worktreeInput: string;
      if (worktreeList.length > 0) {
        worktreeInput =
          await Bun.$`echo ${worktreeList.join("\n")} | fzf --prompt="Select or type new worktree: " --print-query`
            .nothrow()
            .text();
      } else {
        worktreeInput =
          await Bun.$`echo "" | fzf --prompt="Enter new worktree name: " --print-query`
            .nothrow()
            .text();
      }

      const lines = worktreeInput.trim().split("\n");
      const query = lines[0] || "";
      const selection = lines[1] || "";

      let worktree: string;
      if (selection && selection !== "[new]") {
        worktree = selection;
      } else if (query) {
        worktree = query;
      } else {
        console.log("No worktree selected or entered");
        process.exit(0);
      }

      const targetWorktreePath = `${worktreeDir}/${worktree}`;
      const repoPath = `${githubDir}/${repo}`;

      const worktreeExists =
        await Bun.$`test -d ${targetWorktreePath} && echo "yes" || echo "no"`.text();
      if (worktreeExists.trim() === "yes") {
        console.log(`Attaching to existing worktree: ${targetWorktreePath}`);
      } else {
        console.log(`Creating new worktree: ${worktree}`);
        const branchExists =
          await Bun.$`git -C ${repoPath} branch --list ${worktree} | wc -l`.text();
        if (branchExists.trim() === "0") {
          await Bun.$`git -C ${repoPath} worktree add ${targetWorktreePath} -b ${worktree}`.nothrow();
        } else {
          await Bun.$`git -C ${repoPath} worktree add ${targetWorktreePath} ${worktree}`.nothrow();
        }
      }

      const sessionName = `${repo}-${worktree}`;
      const tmuxRunning =
        await Bun.$`tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`.text();

      const inTmux = process.env.TMUX !== undefined;

      if (tmuxRunning.trim() === "yes") {
        if (inTmux) {
          console.log(`Switching to tmux session: ${sessionName}`);
          await Bun.$`tmux switch-client -t ${sessionName}`;
        } else {
          console.log(`Attaching to existing tmux session: ${sessionName}`);
          await Bun.$`tmux attach-session -t ${sessionName}`;
        }
      } else {
        console.log(`Starting new tmux session: ${sessionName}`);
        if (inTmux) {
          await Bun.$`tmux new-session -s ${sessionName} -c ${targetWorktreePath} -d && tmux switch-client -t ${sessionName}`;
        } else {
          await Bun.$`tmux new-session -s ${sessionName} -c ${targetWorktreePath}`;
        }
      }
    });
}
