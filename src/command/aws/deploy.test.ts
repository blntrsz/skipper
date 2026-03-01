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
  const template = JSON.parse(
    buildDeployTemplate({
      workerSubscriptions: [
        { workerId: "issue-solver", events: ["issues"] },
        { workerId: "review", events: ["pull_request"] },
      ],
    }),
  ) as {
    Resources: Record<string, any>;
    Parameters: Record<string, any>;
    Outputs: Record<string, any>;
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
  expect(template.Parameters.GitHubToken).toBeDefined();
  expect(template.Parameters.LambdaCodeS3Bucket).toBeDefined();
  expect(template.Parameters.LambdaCodeS3Key).toBeDefined();
  expect(template.Parameters.WorkersSha256).toBeDefined();
  expect(template.Parameters.WorkersChunk00).toBeDefined();

  const lambdaEntries = Object.entries(template.Resources).filter(
    ([, resource]) => resource.Type === "AWS::Lambda::Function",
  );
  expect(lambdaEntries).toHaveLength(2);

  const expectedEventsByWorker = new Map([
    ["issue-solver", ["issues"]],
    ["review", ["pull_request"]],
  ]);
  for (const [logicalId, lambda] of lambdaEntries) {
    const workerId = lambda.Properties.Environment.Variables.SKIPPER_WORKER_ID;
    expect(workerId).toBeDefined();
    expect(lambda.Properties.Environment.Variables.ECS_CLUSTER_ARN.Ref).toBe("EcsClusterArn");
    expect(lambda.Properties.Environment.Variables.WEBHOOK_SECRET["Fn::Sub"]).toContain(
      "resolve:ssm:",
    );
    expect(lambda.Properties.Environment.Variables.GITHUB_TOKEN.Ref).toBe("GitHubToken");

    const expectedEvents = expectedEventsByWorker.get(workerId);
    expect(expectedEvents).toBeDefined();
    expectedEventsByWorker.delete(workerId);

    const eventRule = template.Resources[logicalId.replace(/LambdaFunction$/, "EventRule")];
    expect(eventRule).toBeDefined();
    expect(eventRule.Type).toBe("AWS::Events::Rule");
    expect(eventRule.Properties.EventPattern.detail.repository.full_name[0].Ref).toBe(
      "RepositoryFullName",
    );
    expect(eventRule.Properties.EventPattern.source[0].Ref).toBe("EventSource");
    expect(eventRule.Properties.EventPattern["detail-type"][0].Ref).toBe("EventDetailType");
    expect(eventRule.Properties.EventPattern.detail.headers["x-github-event"]).toEqual(
      expectedEvents,
    );

    const permission =
      template.Resources[logicalId.replace(/LambdaFunction$/, "LambdaInvokePermission")];
    expect(permission).toBeDefined();
    expect(permission.Type).toBe("AWS::Lambda::Permission");
  }
  expect(expectedEventsByWorker.size).toBe(0);

  expect(template.Resources.RepositoryWorkerLambdaRole).toBeDefined();
  expect(template.Outputs.WorkerSubscriptionCount.Value).toBe("2");
});
