# @skippercorp/skipper-cli

## 0.2.8

### Patch Changes

- d590ef4: Fix tmux switch client when in tmux session

## 0.2.7

### Patch Changes

- 5fb5055: final fix for the interactive shell

## 0.2.6

### Patch Changes

- 1fd6f38: final fix for interactive command

## 0.2.5

### Patch Changes

- 7527665: Fix tmux attach process handling by removing stdout read from detached process
- b4c474c: add patch version for fixing interactive command

## 0.2.4

### Patch Changes

- b1a4da6: fix interactive command

## 0.2.3

### Patch Changes

- a587615: fix tmux attach by using direct Bun process spawning for interactive attach/switch, validating live tmux clients, and clearing stale tmux env before external session commands

## 0.2.2

### Patch Changes

- f7137b4: fix: disable detached mode & stderr piping for tmux attach/switch. prevents early child exit by ensuring interactive tty binding stays active

## 0.2.1

### Patch Changes

- d404408: Patch release for CLI improvements

## 0.2.0

### Minor Changes

- 6223098: Add `workspace prompt` to run OpenCode in a selected workspace. Stream replies live and save the synced session transcript in local session history.

## 0.1.0

### Minor Changes

- 82d0862: Add main branch option to workspace picker. Existing-workspace picker (attach/run/remove) now shows main as a selectable option; selecting main passes undefined branch to ProjectModel, targeting the main checkout at ~/.local/share/github/<repo>. Real branch worktrees named main are disambiguated as "main (branch worktree)".

### Patch Changes

- 289d6ae: Add shared root command wiring so global `--dry-run` and `--silent` flags work from every CLI entrypoint, including short aliases.
- 7d1771c: Add clone command to handle workspace cloning from git branches with improved workspace cwd handling
- 39aee17: Rename CLI sandbox commands to workspace commands so the public interface matches the underlying workspace model.
- 8dab093: Fix the CLI build scripts to use the real entry file so release builds succeed on CI.
- df2ad89: Make `w rm` treat stale worktree metadata as already removed so cleanup still succeeds.

## 0.0.4

### Patch Changes

- 969b3a0: Fix sandbox switch tmux detection when shell checks use redirects, so `sk s sw` can attach sessions again.

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
