import { expect, test } from "bun:test";
import { routeWorkers } from "./route.js";

test("routeWorkers matches event and action", () => {
  const matched = routeWorkers(
    {
      workers: [
        {
          metadata: { id: "review", type: "code-review", enabled: true },
          triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
          runtime: { mode: "comment-only", allowPush: false, prompt: "Review" },
        },
      ],
    },
    {
      provider: "github",
      event: "pull_request",
      action: "opened",
    },
  );
  expect(matched.map((worker) => worker.metadata.id)).toEqual(["review"]);
});

test("routeWorkers applies repository filter", () => {
  const matched = routeWorkers(
    {
      workers: [
        {
          metadata: { id: "review", type: "code-review", enabled: true },
          triggers: [
            {
              provider: "github",
              event: "pull_request",
              actions: ["opened"],
              if: { repository: ["acme/api"] },
            },
          ],
          runtime: { mode: "comment-only", allowPush: false, prompt: "Review" },
        },
      ],
    },
    {
      provider: "github",
      event: "pull_request",
      action: "opened",
      repository: "acme/web",
    },
  );
  expect(matched).toHaveLength(0);
});

test("routeWorkers ignores disabled workers", () => {
  const matched = routeWorkers(
    {
      workers: [
        {
          metadata: { id: "review", type: "code-review", enabled: false },
          triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
          runtime: { mode: "comment-only", allowPush: false, prompt: "Review" },
        },
      ],
    },
    {
      provider: "github",
      event: "pull_request",
      action: "opened",
    },
  );
  expect(matched).toHaveLength(0);
});
