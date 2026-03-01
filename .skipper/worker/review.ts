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
      "Review this pull request and output JSON only. No markdown, no prose, no code fences. Return object: {\"version\":1,\"findings\":[...]} where each finding has: severity (major|minor), path, line, title, body. Report only major/minor issues (correctness, regressions, security, reliability, meaningful test gaps). Ignore style-only or nitpick feedback. Keep title/body concise and actionable. Use exact changed-line path+line from the PR diff only. Do not modify files, commit, push, or post comments yourself.",
  },
} satisfies WorkerDefinition;

export default reviewWorker;
