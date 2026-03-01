import type { WorkerDefinition } from "../../src/worker/contract.js";

const issueSolverWorker = {
  metadata: {
    id: "issue-solver",
    type: "issue-solver",
    description: "Solve newly opened issues and open pull requests.",
    enabled: true,
    version: "1",
  },
  triggers: [
    {
      provider: "github",
      event: "issues",
      actions: ["opened"],
    },
  ],
  runtime: {
    agent: "opencode",
    mode: "apply",
    allowPush: true,
    prompt:
      "A new GitHub issue was opened. Use GITHUB_REPO + GITHUB_ISSUE_NUMBER to inspect it, implement the smallest correct fix, and open PRs. Before each PR, sum added+deleted lines from git diff --numstat while excluding lockfiles (bun.lock, package-lock.json, pnpm-lock.yaml, yarn.lock). Hard rule: each PR must stay at or below 200 changed non-lockfile lines; lockfile changes do not count. If complete fix is bigger than 200 non-lockfile lines, split into multiple coherent PRs, each independently reviewable and <=200 non-lockfile lines. Keep PR bodies explicit about scope and sequencing.",
  },
} satisfies WorkerDefinition;

export default issueSolverWorker;
