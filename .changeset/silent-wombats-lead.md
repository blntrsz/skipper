---
"@skippercorp/skipper-cli": patch
---

fix tmux attach by using direct Bun process spawning for interactive attach/switch, validating live tmux clients, and clearing stale tmux env before external session commands
