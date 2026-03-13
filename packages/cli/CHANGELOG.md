# @skippercorp/skipper-cli

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
