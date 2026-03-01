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
      "Review this pull request and submit one consolidated review with all comments in a single batch. Only report major or minor issues (correctness, regressions, security, reliability, and meaningful test gaps). Ignore nitpicks or style-only feedback. Keep comments concise and actionable. Do not modify files, commit, or push.",
  },
} satisfies WorkerDefinition;

export default reviewWorker;
