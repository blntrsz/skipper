import { expect, test } from "bun:test";
import {
  dedupeFindings,
  readContextFromEnv,
  resolveHeadSha,
} from "./inline-runner.js";

test("readContextFromEnv parses required values", () => {
  const context = readContextFromEnv({
    GITHUB_REPO: "acme/repo",
    GITHUB_PR_NUMBER: "123",
    GITHUB_PR_HEAD_SHA: "abc",
    PROMPT: "review",
    ECS_AGENT: "opencode",
    OPENCODE_MODEL: "model",
  });

  expect(context.repo).toBe("acme/repo");
  expect(context.prNumber).toBe("123");
  expect(context.prHeadSha).toBe("abc");
  expect(context.agent).toBe("opencode");
  expect(context.opencodeModel).toBe("model");
});

test("dedupeFindings removes duplicate path line title", () => {
  const deduped = dedupeFindings([
    {
      severity: "major",
      path: "src/a.ts",
      line: 10,
      title: "Race",
      body: "first",
    },
    {
      severity: "minor",
      path: "src/a.ts",
      line: 10,
      title: "race",
      body: "second",
    },
  ]);

  expect(deduped.length).toBe(1);
  const firstFinding = deduped[0];
  expect(firstFinding).toBeDefined();
  if (!firstFinding) {
    return;
  }
  expect(firstFinding.body).toBe("first");
});

test("resolveHeadSha prefers env value", async () => {
  const value = await resolveHeadSha("acme/repo", "123", "from-env");
  expect(value).toBe("from-env");
});
