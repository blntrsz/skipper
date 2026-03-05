# @skippercorp/skipper

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
