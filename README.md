<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">@skippercorp/skipper</h1>

<p align="center">
  Fast local worktree flow + task management CLI.
</p>

## Install

```bash
bun add -g @skippercorp/skipper
```

Or run without installing:

```bash
bunx @skippercorp/skipper --help
```

## Quick start

```bash
# Clone a repo
skipper clone owner/repo

# Create worktree + tmux session
skipper a

# Run a prompt in a repo
skipper run "fix typo in README"

# Remove worktree + tmux session
skipper rm
```

## Commands

| Command | Description |
|---------|-------------|
| `skipper clone <owner/repo>` | Clone repo into `~/.local/share/github/<repo>` |
| `skipper create` (or `a`) | Create worktree + tmux session (interactive) |
| `skipper remove` (or `rm`) | Remove worktree + tmux session (interactive) |
| `skipper run "<prompt>"` | Run prompt in selected repo |
| `skipper task create` | Create a task |
| `skipper task list` | List all tasks |
| `skipper task get --id <id>` | Get task by ID |
| `skipper task update-state --id <id> --state <state>` | Update task state |
| `skipper task delete --id <id>` | Delete a task |

## Requirements

- `bun`
- `git`
- `gh` (GitHub CLI)
- `fzf` (for interactive selection)
- `tmux`

## Development

```bash
bun install
bun run cli -- --help
bun run typecheck
bun test
```

## Release

Uses Changesets for versioning:

```bash
bun run changeset  # Add changeset
bun run version-packages  # Bump versions
bun run release  # Publish to npm
```
