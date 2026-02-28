import { expect, test } from "bun:test";
import { parseGitHubRepoFromRemote, resolveGithubRepo } from "./github.js";

test("parseGitHubRepoFromRemote supports ssh", () => {
  expect(parseGitHubRepoFromRemote("git@github.com:acme/api.git")).toBe(
    "acme/api",
  );
});

test("parseGitHubRepoFromRemote supports https", () => {
  expect(parseGitHubRepoFromRemote("https://github.com/acme/api")).toBe(
    "acme/api",
  );
});

test("resolveGithubRepo prefers explicit", async () => {
  const repo = await resolveGithubRepo("acme/repo", {
    SKIPPER_GITHUB_REPO: "nope/ignored",
  });
  expect(repo).toBe("acme/repo");
});

test("resolveGithubRepo uses env", async () => {
  const repo = await resolveGithubRepo(undefined, {
    SKIPPER_GITHUB_REPO: "acme/from-env",
  }, "/");
  expect(repo).toBe("acme/from-env");
});
