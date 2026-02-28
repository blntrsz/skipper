import { describe, expect, test } from "bun:test";
import { buildTemplate } from "./template.js";

describe("buildTemplate", () => {
  test("contains core resources", () => {
    const template = JSON.parse(buildTemplate()) as {
      Resources: Record<string, any>;
      Outputs: Record<string, unknown>;
      Parameters: Record<string, any>;
    };

    expect(template.Resources.ApiGatewayRestApi).toBeDefined();
    expect(template.Resources.IngressQueue).toBeDefined();
    expect(template.Resources.WebhookEcsCluster).toBeDefined();
    expect(template.Resources.WebhookTaskDefinition).toBeDefined();
    expect(template.Resources.ForwarderLambdaFunction).toBeDefined();
    expect(template.Resources.QueueToLambdaEventSourceMapping).toBeDefined();
    expect(template.Parameters.WebhookSecret).toBeDefined();
    expect(template.Parameters.LambdaCodeS3Bucket).toBeDefined();
    expect(template.Parameters.Prompt).toBeDefined();
    expect(template.Parameters.AgentType).toBeDefined();
    expect(template.Parameters.GitHubToken).toBeDefined();
    expect(template.Parameters.AnthropicApiKey).toBeDefined();
    expect(template.Parameters.WorkersSha256).toBeDefined();
    expect(template.Parameters.WorkersEncoding).toBeDefined();
    expect(template.Parameters.WorkersChunkCount).toBeDefined();
    expect(template.Parameters.WorkersChunk00).toBeDefined();

    const task = template.Resources.WebhookTaskDefinition;
    const container = task.Properties.ContainerDefinitions[0];
    expect(container.Image).toContain("ubuntu:24.04");
    expect(container.Command[0]).toBe("/bin/bash");

    const lambdaVars = template.Resources.ForwarderLambdaFunction.Properties.Environment
      .Variables;
    expect(lambdaVars.PROMPT).toBeDefined();
    expect(lambdaVars.GITHUB_TOKEN).toBeDefined();
    expect(lambdaVars.ANTHROPIC_API_KEY).toBeDefined();
    expect(lambdaVars.WORKERS_STACK_NAME).toBeDefined();
    expect(lambdaVars.WORKERS_SHA256).toBeDefined();
    expect(lambdaVars.WORKERS_CHUNK_COUNT).toBeDefined();

    expect(template.Outputs.ApiInvokeUrl).toBeDefined();
    expect(template.Outputs.EcsSecurityGroupId).toBeDefined();
    expect(template.Outputs.EcsSubnetIdsCsv).toBeDefined();

    const taskRolePolicies = template.Resources.WebhookTaskRole.Properties.Policies;
    expect(taskRolePolicies).toBeDefined();
    const statement0Actions = taskRolePolicies[0].PolicyDocument.Statement[0].Action;
    const statement1Actions = taskRolePolicies[0].PolicyDocument.Statement[1].Action;
    expect(statement0Actions).toContain("bedrock:InvokeModel");
    expect(statement0Actions).toContain("bedrock:InvokeModelWithResponseStream");
    expect(statement0Actions).toContain("bedrock:ListInferenceProfiles");
    expect(statement1Actions).toContain("aws-marketplace:ViewSubscriptions");
    expect(statement1Actions).toContain("aws-marketplace:Subscribe");

    const taskContainer = template.Resources.WebhookTaskDefinition.Properties.ContainerDefinitions[0];
    const envNames = taskContainer.Environment.map((entry: { Name: string }) => entry.Name);
    expect(envNames).toContain("CLAUDE_CODE_USE_BEDROCK");
    expect(envNames).toContain("ECS_AGENT");
    expect(envNames).toContain("ANTHROPIC_MODEL");
    expect(envNames).toContain("ANTHROPIC_DEFAULT_SONNET_MODEL");

    expect(lambdaVars.ECS_AGENT).toBeDefined();
  });
});
