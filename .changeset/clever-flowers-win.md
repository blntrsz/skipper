---
"@skippercorp/skipper-cli": minor
---

Add main branch option to workspace picker. Existing-workspace picker (attach/run/remove) now shows main as a selectable option; selecting main passes undefined branch to ProjectModel, targeting the main checkout at ~/.local/share/github/<repo>. Real branch worktrees named main are disambiguated as "main (branch worktree)".
