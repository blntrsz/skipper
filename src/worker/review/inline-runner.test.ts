import { expect, test } from "bun:test";
import {
  dedupeFindings,
  main,
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

test("main posts one inline comment per mapped finding", async () => {
  const posted: Array<{ path: string; line: number; headSha: string }> = [];
  const logs: string[] = [];

  await main({
    env: {
      GITHUB_REPO: "acme/repo",
      GITHUB_PR_NUMBER: "44",
      PROMPT: "review prompt",
      ECS_AGENT: "claude",
      OPENCODE_MODEL: "model",
    },
    deps: {
      runAgent: async () =>
        JSON.stringify({
          version: 1,
          findings: [
            {
              severity: "major",
              path: "src/a.ts",
              line: 2,
              title: "race",
              body: "fix race",
            },
            {
              severity: "minor",
              path: "src/a.ts",
              line: 99,
              title: "unmapped",
              body: "skip",
            },
          ],
        }),
      fetchPullRequestFiles: async () =>
        JSON.stringify([
          [
            {
              filename: "src/a.ts",
              patch: "@@ -1 +1,2 @@\n-old\n+new\n+again",
            },
          ],
        ]),
      resolveHeadSha: async () => "headsha",
      postInlineComment: async (_repo, _prNumber, headSha, finding) => {
        posted.push({ path: finding.path, line: finding.line, headSha });
      },
      logInfo: (message) => {
        logs.push(message);
      },
      logWarn: (_message) => {},
    },
  });

  expect(posted.length).toBe(1);
  const firstPosted = posted[0];
  expect(firstPosted).toBeDefined();
  if (!firstPosted) {
    return;
  }
  expect(firstPosted).toEqual({ path: "src/a.ts", line: 2, headSha: "headsha" });
  expect(logs).toContain("skipped 1 unmappable findings");
  expect(logs).toContain("posted 1 inline comments");
});

test("main throws on parse failure", async () => {
  const warnings: string[] = [];
  let caught: unknown;

  try {
    await main({
      env: {
        GITHUB_REPO: "acme/repo",
        GITHUB_PR_NUMBER: "44",
        PROMPT: "review prompt",
      },
      deps: {
        runAgent: async () => "not-json",
        fetchPullRequestFiles: async () => "[]",
        resolveHeadSha: async () => "headsha",
        postInlineComment: async () => {},
        logInfo: (_message) => {},
        logWarn: (message) => {
          warnings.push(message);
        },
      },
    });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  if (caught instanceof Error) {
    expect(caught.message).toContain("review output parse failed");
  }
  expect(warnings.length).toBe(1);
  const firstWarning = warnings[0];
  expect(firstWarning).toBeDefined();
  if (!firstWarning) {
    return;
  }
  expect(firstWarning).toContain("review output parse failed");
});

test("main exits early when no findings map to changed lines", async () => {
  const logs: string[] = [];
  let postCount = 0;

  await main({
    env: {
      GITHUB_REPO: "acme/repo",
      GITHUB_PR_NUMBER: "44",
      PROMPT: "review prompt",
    },
    deps: {
      runAgent: async () =>
        JSON.stringify({
          version: 1,
          findings: [
            {
              severity: "major",
              path: "src/a.ts",
              line: 99,
              title: "unmapped",
              body: "skip",
            },
          ],
        }),
      fetchPullRequestFiles: async () =>
        JSON.stringify([
          [
            {
              filename: "src/a.ts",
              patch: "@@ -1 +1 @@\n-old\n+new",
            },
          ],
        ]),
      resolveHeadSha: async () => "headsha",
      postInlineComment: async () => {
        postCount += 1;
      },
      logInfo: (message) => {
        logs.push(message);
      },
      logWarn: (_message) => {},
    },
  });

  expect(postCount).toBe(0);
  expect(logs).toContain("skipped 1 unmappable findings");
  expect(logs).toContain("no findings mapped to changed lines");
});

test("main surfaces pull-files fetch errors", async () => {
  let caught: unknown;

  try {
    await main({
      env: {
        GITHUB_REPO: "acme/repo",
        GITHUB_PR_NUMBER: "44",
        PROMPT: "review prompt",
      },
      deps: {
        runAgent: async () =>
          JSON.stringify({
            version: 1,
            findings: [
              {
                severity: "major",
                path: "src/a.ts",
                line: 2,
                title: "issue",
                body: "desc",
              },
            ],
          }),
        fetchPullRequestFiles: async () => {
          throw new Error("gh api failed");
        },
        resolveHeadSha: async () => "headsha",
        postInlineComment: async () => {},
        logInfo: (_message) => {},
        logWarn: (_message) => {},
      },
    });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  if (caught instanceof Error) {
    expect(caught.message).toContain("gh api failed");
  }
});
