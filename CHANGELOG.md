# @skippercorp/skipper

## 1.4.0

### Minor Changes

- f5aa831: `switch --create`: prompt for repository then text input for new branch name, creates worktree and switches tmux

### Patch Changes

- 8336af0: Consolidate services and remove legacy modules (Agent, Workflow, DockerSandbox); reorganize Git and Tmux internals.

## 1.3.2

### Patch Changes

- 15aa075: Refactor shell execution to use `Bun.$` across agent, workflow, tmux, git, docker, and clone flows, keeping error handling consistent while removing direct spawn usage.
- fa5020a: refactor: extract Shell/Tmux into modules, pass branch to git worktree add

## 1.3.1

### Patch Changes

- 122c70e: Fix tmux session attach outside tmux by using an interactive spawn path, so `sk sw` no longer exits right after connect.

## 1.3.0

### Minor Changes

- 3e8339d: add workflow runner from user or workspace definitions

### Patch Changes

- c00db45: fix effect process cleanup problem

## 1.2.9

### Patch Changes

- cd766e8: Keep tmux switch aligned with the worktree layout by resolving branch names from nested worktree paths and by creating or attaching tmux sessions with the expected non-tmux fallback.

## 1.2.8

### Patch Changes

- 6a23c2c: Add `Ctrl+n` and `Ctrl+p` navigation to the interactive picker so switcher selection supports vim-style movement alongside arrow keys.
- 63a7f88: Replace the old picker flow with a top-level `switch` command so repo and branch selection stay explicit while tmux switching works with a lighter built-in interactive picker.

## 1.2.7

### Patch Changes

- 8963edb: Move agent command and repository selection into internal services so CLI-facing modules focus on orchestration and sandbox adapters share git/tmux behavior.
- 6a96c1b: Keep sandbox command wiring in `Sandbox/Cli` and re-export it into the root CLI so sandbox subcommands stay grouped in one module.
- 3739ebb: Add folder-backed Docker sandboxes with user/repo override, repo-scoped image names, repo+branch container names, and create/remove flow without attach.

## 1.2.6

### Patch Changes

- 0370bcb: replace `@ff-labs/bun` with `fuse.js` in the picker so fuzzy matching stays in-memory and avoids the temp-dir scan setup

## 1.2.5

### Patch Changes

- 311eaad: replace the old fzf flow with an OpenTUI repo/worktree picker, and split interactive picker use from direct worktree creation commands
- f4471c1: fix repo path resolution for `sk run` and fail fast on invalid repository input

## 1.2.4

### Patch Changes

- 91f54fd: move to darwin arm 64

## 1.2.3

### Patch Changes

- f7bf49f: fix tmux attach

## 1.2.2

### Patch Changes

- 58b0fcd: add build command

## 1.2.1

### Patch Changes

- 48b879d: fix build

## 1.2.0

### Minor Changes

- 777dfad: add effect

## 1.1.0

### Minor Changes

- 8aedb35: Add a local `skipper ui` dashboard command to manage worktrees (checkout, run prompt, remove, refresh) from one TUI screen.
  Refactor worktree lifecycle logic into a shared service used by `a`, `rm`, `run`, and the new UI command.

### Patch Changes

- 08f906b: force `sk rm` to remove dirty worktrees via `git worktree remove --force`

## 1.0.3

### Patch Changes

- a0476d9: add `--force` flag to `skipper rm` to remove dirty worktrees

## 1.0.2

### Patch Changes

- 899b12a: rename bun to sk

## 1.0.1

### Patch Changes

- 020de8f: Rename package to `@skippercorp/skipper`, add Changesets release scripts/config, and add CI automation for version PR + npm publish.
