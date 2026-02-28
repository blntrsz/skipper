import { expect, test } from "bun:test";
import { createTemplateParameters, resolveGithubEvents } from "./bootstrap.js";
import { parseGithubEvents, parseTags, resolveDeployDefaults } from "./defaults.js";
import { encodeWorkerManifest } from "../../worker/serialize.js";

test("parseTags parses comma tags", () => {
  expect(parseTags("team=infra,env=dev")).toEqual({ team: "infra", env: "dev" });
});

test("parseTags handles empty", () => {
  expect(parseTags(undefined)).toBeUndefined();
});

test("resolveDeployDefaults uses env and cwd", () => {
  const defaults = resolveDeployDefaults("/tmp/my_service", {
    SKIPPER_AWS_ENV: "sandbox",
    AWS_REGION: "eu-west-1",
  });

  expect(defaults.service).toBe("my-service");
  expect(defaults.env).toBe("sandbox");
  expect(defaults.region).toBe("eu-west-1");
});

test("resolveDeployDefaults falls back sanely", () => {
  const defaults = resolveDeployDefaults("/", {});

  expect(defaults.service).toBe("skipper");
  expect(defaults.env).toBe("sandbox");
  expect(defaults.region).toBe("us-east-1");
});

test("parseGithubEvents defaults to all", () => {
  expect(parseGithubEvents(undefined)).toEqual(["*"]);
  expect(parseGithubEvents(" ")).toEqual(["*"]);
});

test("parseGithubEvents parses csv", () => {
  expect(parseGithubEvents("push,pull_request")).toEqual(["push", "pull_request"]);
});

test("resolveGithubEvents merges explicit and worker events", () => {
  expect(resolveGithubEvents(["push", "pull_request"], ["pull_request", "issues"])).toEqual([
    "issues",
    "pull_request",
    "push",
  ]);
});

test("resolveGithubEvents falls back to wildcard", () => {
  expect(resolveGithubEvents([], [])).toEqual(["*"]);
});

test("createTemplateParameters includes eventbridge params", () => {
  const encoded = encodeWorkerManifest({
    workers: [
      {
        metadata: { id: "review", type: "code-review", enabled: true },
        triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
        runtime: { prompt: "Review" },
      },
    ],
  });
  const context: Parameters<typeof createTemplateParameters>[0] = {
    rootDir: "/tmp/repo",
    service: "svc",
    env: "sandbox",
    region: "us-east-1",
    stackName: "svc-sandbox-bootstrap",
    apiName: "svc-sandbox-events-api",
    stageName: "sandbox",
    githubRepo: "acme/repo",
    githubEvents: ["*"],
    webhookSecret: "secret",
    workerCount: encoded.workerCount,
    workerIds: ["review"],
    workerManifestByteLength: encoded.byteLength,
    workerParameterValues: encoded.parameterValues,
    timeoutMinutes: 30,
    tags: undefined,
    skipGithubWebhook: false,
    eventBusName: "svc-sandbox",
    eventSource: "svc.webhook",
    eventDetailType: "WebhookReceived",
  };
  const parameters = createTemplateParameters(context, {
    vpcId: "vpc-123",
    subnetIds: ["subnet-1", "subnet-2"],
  });
  expect(parameters.VpcId).toBe("vpc-123");
  expect(parameters.SubnetIds).toBe("subnet-1,subnet-2");
  expect(parameters.EventBusName).toBe("svc-sandbox");
  expect(parameters.EventSource).toBe("svc.webhook");
  expect(parameters.EventDetailType).toBe("WebhookReceived");
  expect(parameters.WebhookSecret).toBe("secret");
  expect(String(parameters.WorkersSha256).length).toBeGreaterThan(0);
});
