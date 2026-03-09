<p align="center">
  <img src="docs/skipper-logo.png" alt="Skipper logo" width="220" />
</p>

<h1 align="center">@skippercorp/skipper</h1>

<p align="center">
  Fast local worktree flow + task management CLI.
</p>

Docker sandboxes can now be defined per user in `~/.config/skipper/sandbox/<name>/` or per repo in `~/.local/share/github/<repo>/.skipper/sandbox/<name>/`.

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

# Open interactive picker
skipper p

# Create sandbox resources
skipper sandbox add

# Create Docker sandbox
skipper sandbox add --type docker --repository repo --branch feature --sandbox dev

# Run a prompt in a repo
skipper run "fix typo in README"

# Remove sandbox resources
skipper sandbox remove
```

## Commands

| Command | Description |
|---------|-------------|
| `skipper clone <owner/repo>` | Clone repo into `~/.local/share/github/<repo>` |
| `skipper sandbox add` | Create sandbox resources |
| `skipper sandbox picker` (or `s p`) | Open interactive sandbox picker |
| `skipper picker` (or `p`) | Open interactive repo/worktree picker |
| `skipper sandbox remove` (or `s rm`) | Remove sandbox resources |
| `skipper run "<prompt>"` | Run prompt in selected repo |
| `skipper task create` | Create a task |
| `skipper task list` | List all tasks |
| `skipper task get --id <id>` | Get task by ID |
| `skipper task update-state --id <id> --state <state>` | Update task state |
| `skipper task delete --id <id>` | Delete a task |

## Docker sandboxes

Each sandbox dir is a Docker build context and must contain a `Dockerfile`.

```text
~/.config/skipper/sandbox/dev/
  Dockerfile
  sandbox.json

~/.local/share/github/my-repo/.skipper/sandbox/dev/
  Dockerfile
  sandbox.json
```

Optional `sandbox.json` fields:

```json
{
  "containerPath": "/workspace",
  "command": ["sleep", "infinity"]
}
```

- repo sandbox with same name overrides user sandbox
- image name is repo-scoped: `skipper-<repo>:<sandbox>`
- container name is repo+branch scoped: `skipper-<repo>-<branch>-<sandbox>`
- Docker flow creates missing worktree for non-`main`, builds image, starts container, then copies source with `docker cp`
- Docker picker creates only; no attach
- Docker remove deletes container only; image stays cached

## Requirements

- `bun`
- `git`
- `gh` (GitHub CLI)
- terminal with TTY support (for interactive picker)
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
