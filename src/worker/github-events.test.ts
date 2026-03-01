import { expect, test } from "bun:test";
import {
  collectGithubEventSubscriptions,
  collectGithubEventsFromWorkers,
} from "./github-events.js";

test("collectGithubEventsFromWorkers dedupes and sorts events", () => {
  const events = collectGithubEventsFromWorkers([
    {
      metadata: { id: "review", type: "code-review", enabled: true },
      triggers: [
        { provider: "github", event: "pull_request", actions: ["opened"] },
        { provider: "github", event: "issue_comment", actions: ["created"] },
      ],
      runtime: { prompt: "Review" },
    },
    {
      metadata: { id: "triage", type: "triage", enabled: true },
      triggers: [{ provider: "github", event: "pull_request", actions: ["synchronize"] }],
      runtime: { prompt: "Triage" },
    },
  ]);

  expect(events).toEqual(["issue_comment", "pull_request"]);
});

test("collectGithubEventsFromWorkers skips disabled workers", () => {
  const events = collectGithubEventsFromWorkers([
    {
      metadata: { id: "disabled", type: "code-review", enabled: false },
      triggers: [{ provider: "github", event: "pull_request" }],
      runtime: { prompt: "Disabled" },
    },
  ]);

  expect(events).toEqual([]);
});

test("collectGithubEventSubscriptions returns per-worker subscriptions", () => {
  const subscriptions = collectGithubEventSubscriptions([
    {
      metadata: { id: "review", type: "code-review", enabled: true },
      triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
      runtime: { prompt: "Review" },
    },
    {
      metadata: { id: "issue-solver", type: "issue-solver", enabled: true },
      triggers: [
        { provider: "github", event: "issues", actions: ["opened"] },
        { provider: "github", event: "issues", actions: ["edited"] },
      ],
      runtime: { prompt: "Solve issue" },
    },
  ]);

  expect(subscriptions).toEqual([
    { workerId: "issue-solver", events: ["issues"] },
    { workerId: "review", events: ["pull_request"] },
  ]);
});
