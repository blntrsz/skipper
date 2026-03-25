---
"@skippercorp/core": patch
---

Fix tmux session attachment error when not already in a tmux session. Inherit stdio streams from parent process to allow proper terminal interaction during attach.
