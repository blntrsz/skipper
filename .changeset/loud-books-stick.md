---
"@skippercorp/skipper-cli": patch
---

Fix bugs found during code review: resolve Layer dependency wiring in local runtime, replace Date.now() with Effect DateTime for consistency, fix broken test mocks, remove spurious async in sync Effect.try handler, fix double initWorkspace call in attach command, correct typo in span name, and simplify force flag spreading in destroy workspace.
