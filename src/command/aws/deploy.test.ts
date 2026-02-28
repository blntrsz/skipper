import { expect, test } from "bun:test";
import { buildRepoScopedStackName } from "./deploy.js";
import { buildDeployTemplate } from "./deploy-template.js";

test("buildRepoScopedStackName prefixes with repository slug", () => {
  expect(buildRepoScopedStackName("acme-repo", "svc", "sandbox")).toBe(
    "acme-repo-svc-sandbox-deploy",
  );
});

test("buildRepoScopedStackName caps length at 128", () => {
  const stackName = buildRepoScopedStackName(
    "acme-repo-very-long-name-very-long-name-very-long-name-very-long-name-very-long-name",
    "service-name-very-long",
    "environment-name-very-long",
  );
  expect(stackName.length).toBeLessThanOrEqual(128);
  expect(stackName).toContain("-");
});

test("buildDeployTemplate includes repository scoped event pattern", () => {
  const template = JSON.parse(buildDeployTemplate()) as {
    Resources: Record<string, any>;
    Parameters: Record<string, any>;
  };

  expect(template.Parameters.RepositoryFullName).toBeDefined();
  expect(template.Parameters.RepositoryPrefix).toBeDefined();
  const rule = template.Resources.RepositoryEventRule;
  expect(rule).toBeDefined();
  expect(rule.Type).toBe("AWS::Events::Rule");
  expect(rule.Properties.EventPattern.detail.repository.full_name[0].Ref).toBe(
    "RepositoryFullName",
  );
  expect(rule.Properties.EventPattern.source[0].Ref).toBe("EventSource");
  expect(rule.Properties.EventPattern["detail-type"][0].Ref).toBe("EventDetailType");
});
