import { expect, test } from "bun:test";
import { parseGithubEvents, parseTags, resolveDeployDefaults } from "./deploy.js";

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
