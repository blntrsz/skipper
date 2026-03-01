import { expect, test } from "bun:test";

test("buildTaskEnvironments includes pull request context env vars", async () => {
  process.env.ECS_CLUSTER_ARN = "arn:aws:ecs:us-east-1:123456789012:cluster/test";
  process.env.ECS_TASK_DEFINITION_ARN = "arn:aws:ecs:us-east-1:123456789012:task-definition/test";
  process.env.ECS_SECURITY_GROUP_ID = "sg-123456";
  process.env.ECS_SUBNET_IDS = "subnet-1,subnet-2";
  process.env.WEBHOOK_SECRET = "secret";

  const modulePath = `./handler.js?test=${Date.now()}`;
  const { buildTaskEnvironments } = (await import(modulePath)) as {
    buildTaskEnvironments: typeof import("./handler.js").buildTaskEnvironments;
  };

  const environments = buildTaskEnvironments(
    {
      prompt: "test prompt",
      action: "opened",
      repository: {
        full_name: "acme/repo",
        clone_url: "https://github.com/acme/repo.git",
      },
      pull_request: {
        number: 123,
        html_url: "https://github.com/acme/repo/pull/123",
        head: {
          ref: "feature",
          sha: "0123456789abcdef0123456789abcdef01234567",
        },
        base: {
          ref: "main",
          sha: "89abcdef0123456789abcdef0123456789abcdef",
        },
      },
    },
    {
      signature: "sha256=abc",
      githubEvent: "pull_request",
      deliveryId: "delivery-1",
    },
    undefined,
  );

  expect(environments.length).toBe(1);
  const firstEnvironment = environments[0];
  expect(firstEnvironment).toBeDefined();
  if (!firstEnvironment) {
    return;
  }
  const environmentMap = new Map(
    firstEnvironment.map((entry) => [entry.name, entry.value] as const),
  );

  expect(environmentMap.get("GITHUB_PR_NUMBER")).toBe("123");
  expect(environmentMap.get("GITHUB_PR_URL")).toBe("https://github.com/acme/repo/pull/123");
  expect(environmentMap.get("GITHUB_PR_HEAD_SHA")).toBe(
    "0123456789abcdef0123456789abcdef01234567",
  );
  expect(environmentMap.get("GITHUB_PR_BASE_SHA")).toBe(
    "89abcdef0123456789abcdef0123456789abcdef",
  );
});
