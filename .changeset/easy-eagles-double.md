---
"@skippercorp/skipper": patch
---

Refactor shell execution to use `Bun.$` across agent, workflow, tmux, git, docker, and clone flows, keeping error handling consistent while removing direct spawn usage.
