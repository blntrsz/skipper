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
    expect(template.Parameters.GitHubToken).toBeDefined();
    expect(template.Parameters.AnthropicApiKey).toBeDefined();

    const task = template.Resources.WebhookTaskDefinition;
    const container = task.Properties.ContainerDefinitions[0];
    expect(container.Image).toContain("ubuntu:24.04");
    expect(container.Command[0]).toBe("/bin/bash");

    const lambdaVars = template.Resources.ForwarderLambdaFunction.Properties.Environment
      .Variables;
    expect(lambdaVars.PROMPT).toBeDefined();
    expect(lambdaVars.GITHUB_TOKEN).toBeDefined();
    expect(lambdaVars.ANTHROPIC_API_KEY).toBeDefined();

    expect(template.Outputs.ApiInvokeUrl).toBeDefined();
  });
});
