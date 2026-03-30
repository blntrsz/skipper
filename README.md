<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">Skipper</h1>

<p align="center">
  Local repo workspace CLI for Git worktrees, Docker sandboxes, and tmux.
</p>

Skipper is a local-first CLI for working across GitHub repositories and branch workspaces without juggling paths by hand. It clones repositories into a shared local root, creates per-branch Git worktrees or Docker sandboxes, opens or switches into matching sessions, and runs shell commands in the right checkout.

By default, Skipper keeps:

- repositories in `~/.local/share/github/<repo>`
- non-`main` worktrees in `~/.local/share/skipper/worktree/<repo>/<repo>.<branch>`

If you omit `--repository` or `--branch` in an interactive terminal, Skipper lets you pick them.

## Requirements

- `bun`
- `docker` (optional, for `--sandbox docker`)
- `git`
- `gh`
- `opencode`
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
sk clone git@github.com:owner/repo.git

# Clone and create a Docker-backed main workspace container
sk clone git@github.com:owner/repo.git --sandbox docker

# Create a workspace for a feature branch
sk workspace create --repository repo --branch feature/my-change

# Create the same workspace in Docker
sk workspace create --repository repo --branch feature/my-change --sandbox docker

# Jump into a tmux session for that workspace
sk workspace attach --repository repo --branch feature/my-change

# Run a shell command in that same workspace
sk workspace run --repository repo --branch feature/my-change --command "bun test"

# Run an OpenCode prompt in that workspace
sk workspace prompt --repository repo --branch feature/my-change "Explain this codebase"
```

`main` is treated specially: it uses the repository checkout directly for the default worktree backend, while other branches use dedicated worktrees. Docker support is additive behind `--sandbox docker`, with worktree remaining the default backend.

Before first `workspace prompt` use, configure OpenCode auth with `opencode auth login`.

## Development

```bash
bun install
bun run cli -- --help
bun run check:fix
bun test
```
