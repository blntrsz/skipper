# @skippercorp/skipper-cli

## 0.0.3

### Patch Changes

- 172192f: Make `sandbox rm` pick missing repo or branch values, remove legacy worktree folders, and print only the user-facing error message from skipper.
- 994c9f2: Make sandbox clone and switch fail more predictably by surfacing friendly dependency errors and recovering when tmux is not already running.
- 2df1ebb: Add `sandbox run` so skipper can pick a repo and branch, prompt for a bash command, run it in the selected workspace, and return the child exit code.

## 0.0.2

### Patch Changes

- 0453da3: Initial release
- 2710c8f: Refactor the CLI into workspace packages, keep runtime access on public imports, and add repo-wide check tooling for lint, format, typecheck, depcruise, and Sheriff.

## 0.0.1

### Minor Changes

- add persisted session commands and store sandbox history in sqlite

### Patch Changes

- Initial release under `@skippercorp/skipper-cli`.
- refactor: centralize runtime and path helpers for cli services
- fix: remove tmux attach debug noise from normal CLI use
