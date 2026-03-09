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

# Create sandbox resources
skipper sandbox add --repository repo --branch feature

# Create Docker sandbox
skipper sandbox add --type docker --repository repo --branch feature --sandbox dev

# Run a prompt in a repo
skipper run --repository repo "fix typo in README"

# Remove sandbox resources
skipper sandbox remove --repository repo --branch feature
```

## Commands

| Command | Description |
|---------|-------------|
| `skipper clone <owner/repo>` | Clone repo into `~/.local/share/github/<repo>` |
| `skipper sandbox add` | Create sandbox resources |
| `skipper sandbox remove` (or `s rm`) | Remove sandbox resources |
| `skipper run --repository <repo> "<prompt>"` | Run prompt in a repo |
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
- Docker remove deletes container only; image stays cached

## Requirements

- `bun`
- `git`
- `gh` (GitHub CLI)
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
