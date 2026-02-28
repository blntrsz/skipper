import { expect, test } from "bun:test";
import {
  createTemplateParameters,
  parseGithubEvents,
  parseTags,
  resolveDeployDefaults,
} from "./deploy.js";

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
  expect(parseGithubEvents("push,pull_request")).toEqual([
    "push",
    "pull_request",
  ]);
});

test("createTemplateParameters includes worker defaults", () => {
  const context: Parameters<typeof createTemplateParameters>[0] = {
    service: "svc",
    env: "sandbox",
    region: "us-east-1",
    stackName: "svc-sandbox",
    queueName: "svc-sandbox-events",
    apiName: "svc-sandbox-events-api",
    stageName: "sandbox",
    agent: "claude",
    githubRepo: "acme/repo",
    githubEvents: ["*"],
    webhookSecret: "secret",
    prompt: "prompt",
    githubToken: "",
    anthropicApiKey: "",
    timeoutMinutes: 30,
    tags: undefined,
    skipGithubWebhook: false,
  };
  const artifact: Parameters<typeof createTemplateParameters>[1] = {
    bucket: "bucket",
    key: "key",
    vpcId: "vpc-1",
    subnetIds: ["subnet-1", "subnet-2"],
  };
  const parameters = createTemplateParameters(context, artifact);
  expect(parameters.WorkersSha256).toBe("");
  expect(parameters.WorkersEncoding).toBe("");
  expect(parameters.WorkersChunkCount).toBe("0");
  expect(parameters.WorkersChunk00).toBe("");
});
