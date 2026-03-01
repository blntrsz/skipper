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
  expect(template.Parameters.EcsClusterArn).toBeDefined();
  expect(template.Parameters.EcsTaskDefinitionArn).toBeDefined();
  expect(template.Parameters.EcsTaskExecutionRoleArn).toBeDefined();
  expect(template.Parameters.EcsTaskRoleArn).toBeDefined();
  expect(template.Parameters.EcsSecurityGroupId).toBeDefined();
  expect(template.Parameters.EcsSubnetIdsCsv).toBeDefined();
  expect(template.Parameters.WebhookSecretParameterName).toBeDefined();
  expect(template.Parameters.LambdaCodeS3Bucket).toBeDefined();
  expect(template.Parameters.LambdaCodeS3Key).toBeDefined();
  expect(template.Parameters.WorkersSha256).toBeDefined();
  expect(template.Parameters.WorkersChunk00).toBeDefined();

  const rule = template.Resources.RepositoryEventRule;
  expect(rule).toBeDefined();
  expect(rule.Type).toBe("AWS::Events::Rule");
  expect(rule.Properties.EventPattern.detail.repository.full_name[0].Ref).toBe(
    "RepositoryFullName",
  );
  expect(rule.Properties.EventPattern.source[0].Ref).toBe("EventSource");
  expect(rule.Properties.EventPattern["detail-type"][0].Ref).toBe("EventDetailType");
  expect(rule.Properties.Targets[0].Id).toBe("RepositoryForwarderLambda");

  const lambda = template.Resources.RepositoryForwarderLambdaFunction;
  expect(lambda).toBeDefined();
  expect(lambda.Type).toBe("AWS::Lambda::Function");
  expect(lambda.Properties.Environment.Variables.ECS_CLUSTER_ARN.Ref).toBe("EcsClusterArn");
  expect(lambda.Properties.Environment.Variables.WEBHOOK_SECRET["Fn::Sub"]).toContain(
    "resolve:ssm:",
  );

  expect(template.Resources.RepositoryForwarderLambdaRole).toBeDefined();
  expect(template.Resources.RepositoryForwarderLambdaInvokePermission).toBeDefined();
});
