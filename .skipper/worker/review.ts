import type { WorkerDefinition } from "../../src/worker/contract.js";

const reviewWorker = {
  metadata: {
    id: "review",
    type: "code-review",
    description: "Review new pull requests and post feedback.",
    enabled: true,
    version: "1",
  },
  triggers: [
    {
      provider: "github",
      event: "pull_request",
      actions: ["opened", "reopened", "ready_for_review", "synchronize"],
    },
  ],
  runtime: {
    mode: "comment-only",
    allowPush: false,
    prompt:
      "Review this pull request. Focus on correctness, regressions, security, and test gaps. Provide concise actionable feedback as comments only. Do not modify files, commit, or push.",
  },
} satisfies WorkerDefinition;

export default reviewWorker;
