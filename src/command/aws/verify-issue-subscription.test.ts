import { expect, test } from "bun:test";
import {
  analyzeIssueTaskLogs,
  isIssueTaskEnvironment,
} from "./verify-issue-subscription.js";

test("isIssueTaskEnvironment matches opened issue payload", () => {
  const matched = isIssueTaskEnvironment(
    [
      { name: "GITHUB_EVENT", value: "issues" },
      { name: "GITHUB_ACTION", value: "opened" },
      { name: "GITHUB_ISSUE_NUMBER", value: "42" },
    ],
    "42",
  );
  expect(matched).toBe(true);
});

test("isIssueTaskEnvironment rejects wrong issue number", () => {
  const matched = isIssueTaskEnvironment(
    [
      { name: "GITHUB_EVENT", value: "issues" },
      { name: "GITHUB_ACTION", value: "opened" },
      { name: "GITHUB_ISSUE_NUMBER", value: "41" },
    ],
    "42",
  );
  expect(matched).toBe(false);
});

test("analyzeIssueTaskLogs matches gh issue view marker", () => {
  const analysis = analyzeIssueTaskLogs(
    ["\u001b[0m$ \u001b[0mgh issue view 42 --repo acme/repo"],
    "acme/repo",
    "42",
  );
  expect(analysis).toEqual({
    matched: true,
    marker: "$ gh issue view 42 --repo acme/repo",
  });
});

test("analyzeIssueTaskLogs matches webfetch marker", () => {
  const analysis = analyzeIssueTaskLogs(
    ["% WebFetch https://api.github.com/repos/acme/repo/issues/42"],
    "acme/repo",
    "42",
  );
  expect(analysis).toEqual({
    matched: true,
    marker: "% WebFetch https://api.github.com/repos/acme/repo/issues/42",
  });
});

test("analyzeIssueTaskLogs flags auth prompt as error", () => {
  const analysis = analyzeIssueTaskLogs(
    ["To get started with GitHub CLI, please run:  gh auth login"],
    "acme/repo",
    "42",
  );
  expect(analysis.matched).toBe(false);
  expect(analysis.error).toContain("missing GitHub auth");
});

test("analyzeIssueTaskLogs flags missing command as error", () => {
  const analysis = analyzeIssueTaskLogs(
    ["/usr/bin/bash: line 1: gh: command not found"],
    "acme/repo",
    "42",
  );
  expect(analysis.matched).toBe(false);
  expect(analysis.error).toContain("command failure");
});
