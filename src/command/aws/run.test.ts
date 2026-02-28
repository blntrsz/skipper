import { expect, test } from "bun:test";
import {
  assertRunStackHasEcsOutputs,
  buildDefaultRunStackName,
  buildRunTaskInput,
  describeTaskStopOutcome,
  parseSubnetIdsCsv,
  readRequiredOutput,
  toGitHubCloneUrl,
} from "./run.js";

test("toGitHubCloneUrl supports owner/repo", () => {
  expect(toGitHubCloneUrl("acme/service")).toBe("https://github.com/acme/service.git");
});

test("toGitHubCloneUrl supports ssh remote", () => {
  expect(toGitHubCloneUrl("git@github.com:acme/service.git")).toBe(
    "https://github.com/acme/service.git",
  );
});

test("readRequiredOutput reads output", () => {
  expect(
    readRequiredOutput(
      [{ OutputKey: "EcsClusterArn", OutputValue: "arn:aws:ecs:cluster/demo" }],
      "EcsClusterArn",
    ),
  ).toBe("arn:aws:ecs:cluster/demo");
});

test("parseSubnetIdsCsv parses csv", () => {
  expect(parseSubnetIdsCsv("subnet-1, subnet-2")).toEqual(["subnet-1", "subnet-2"]);
});

test("buildDefaultRunStackName uses bootstrap suffix", () => {
  expect(buildDefaultRunStackName("svc", "sandbox")).toBe("svc-sandbox-bootstrap");
});

test("buildRunTaskInput includes bedrock env", () => {
  const input = buildRunTaskInput(
    {
      service: "svc",
      env: "sandbox",
      region: "us-east-1",
      stackName: "svc-sandbox",
      repositoryUrl: "https://github.com/acme/service.git",
      prompt: "fix tests",
      agent: "opencode",
      model: "anthropic.claude-3-7-sonnet-20250219-v1:0",
      wait: false,
      timeoutMinutes: 30,
    },
    {
      clusterArn: "arn:cluster",
      taskDefinitionArn: "arn:task-def",
      securityGroupId: "sg-123",
      subnetIds: ["subnet-1", "subnet-2"],
    },
  );

  expect(input.cluster).toBe("arn:cluster");
  expect(input.taskDefinition).toBe("arn:task-def");
  expect(input.networkConfiguration?.awsvpcConfiguration?.subnets).toEqual([
    "subnet-1",
    "subnet-2",
  ]);

  const env = input.overrides?.containerOverrides?.[0]?.environment ?? [];
  const names = env.map((entry) => entry.name);
  expect(names).toContain("CLAUDE_CODE_USE_BEDROCK");
  expect(names).toContain("ECS_AGENT");
  expect(names).toContain("ANTHROPIC_MODEL");
  expect(names).toContain("ANTHROPIC_DEFAULT_SONNET_MODEL");
  expect(names).toContain("PROMPT");
  expect(names).toContain("REPOSITORY_URL");
});

test("describeTaskStopOutcome marks exit code zero as success", () => {
  expect(describeTaskStopOutcome("arn:task/demo", 0, undefined, undefined)).toEqual({
    success: true,
    message: "Task success (arn:task/demo) exitCode=0",
  });
});

test("describeTaskStopOutcome marks non-zero exit as failure", () => {
  expect(
    describeTaskStopOutcome(
      "arn:task/demo",
      1,
      "Essential container in task exited",
      "Exit 1",
    ),
  ).toEqual({
    success: false,
    message:
      "Task failed (arn:task/demo) exitCode=1 stoppedReason=Essential container in task exited containerReason=Exit 1",
  });
});

test("describeTaskStopOutcome marks unknown exit as failure", () => {
  expect(describeTaskStopOutcome("arn:task/demo", undefined, undefined, undefined)).toEqual({
    success: false,
    message: "Task failed (arn:task/demo) exitCode=unknown",
  });
});

test("assertRunStackHasEcsOutputs fails on bootstrap-only outputs", () => {
  expect(() =>
    assertRunStackHasEcsOutputs([{ OutputKey: "EventBusArn", OutputValue: "arn:bus" } as any]),
  ).toThrow("bootstrap stack missing ECS outputs");
});
