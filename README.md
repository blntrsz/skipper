<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">Skipper</h1>

<p align="center">
  Local repo workspace CLI for Git worktrees + tmux.
</p>

Skipper is a local-first CLI for working across GitHub repositories and branch workspaces without juggling paths by hand. It clones repositories into a shared local root, creates per-branch Git worktrees, opens or switches into matching tmux sessions, and runs shell commands in the right checkout.

By default, Skipper keeps:

- repositories in `~/.local/share/github/<repo>`
- non-`main` worktrees in `~/.local/share/skipper/worktree/<repo>/<repo>.<branch>`

If you omit `--repository` or `--branch` in an interactive terminal, Skipper lets you pick them.

## Requirements

- `bun`
- `git`
- `gh`
- `tmux`

## Install

```bash
bun add -g @skippercorp/skipper-cli
```

This installs the `sk` command.

Or run without installing:

```bash
bunx @skippercorp/skipper-cli --help
```

## Getting started

```bash
# Clone into ~/.local/share/github/<repo>
sk clone owner/repo

# Create a workspace for a feature branch
sk workspace create --repository repo --branch feature/my-change

# Jump into a tmux session for that workspace
sk workspace attach --repository repo --branch feature/my-change

# Run a shell command in that same workspace
sk workspace run --repository repo --branch feature/my-change --command "bun test"
```

`main` is treated specially: it uses the repository checkout directly, while other branches use dedicated worktrees.

## Development

```bash
bun install
bun run cli -- --help
bun run check:fix
bun test
```
