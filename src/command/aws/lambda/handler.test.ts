import { expect, test } from "bun:test";

process.env.ECS_CLUSTER_ARN ??= "arn:aws:ecs:region:acct:cluster/demo";
process.env.ECS_TASK_DEFINITION_ARN ??= "arn:aws:ecs:region:acct:task-definition/demo:1";
process.env.ECS_SECURITY_GROUP_ID ??= "sg-123";
process.env.ECS_SUBNET_IDS ??= "subnet-1,subnet-2";
process.env.WEBHOOK_SECRET ??= "secret";
process.env.GITHUB_APP_ID ??= "12345";
process.env.GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER ??= "/skipper/demo/github-app-key";

const handlerModule = import("./handler.js");

test("readInstallationId reads webhook installation id", async () => {
  const { readInstallationId } = await handlerModule;
  expect(readInstallationId({ installation: { id: 42 } })).toBe(42);
  expect(() => readInstallationId({})).toThrow("missing installation.id in github payload");
});

test("buildTaskEnvironments builds base env without token", async () => {
  const { buildTaskEnvironments } = await handlerModule;
  const environments = buildTaskEnvironments(
    {
      prompt: "hello",
      repository: {
        full_name: "acme/repo",
        clone_url: "https://github.com/acme/repo.git",
      },
    },
    {
      signature: "sha256=abc",
      githubEvent: "issues",
      deliveryId: "delivery-1",
    },
    undefined,
  );
  expect(environments).toHaveLength(1);
  const first = environments[0] ?? [];
  expect(first.some((entry) => entry.name === "GITHUB_TOKEN")).toBe(false);
});

test("injectGithubToken appends github token", async () => {
  const { injectGithubToken } = await handlerModule;
  const injected = injectGithubToken(
    [[{ name: "PROMPT", value: "hello" }]],
    "token-123",
  );
  const first = injected[0] ?? [];
  expect(first.find((entry) => entry.name === "GITHUB_TOKEN")?.value).toBe(
    "token-123",
  );
});
