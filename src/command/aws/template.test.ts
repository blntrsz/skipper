import { describe, expect, test } from "bun:test";
import { buildTemplate } from "./template.js";

describe("buildTemplate", () => {
  test("contains core resources", () => {
    const template = JSON.parse(buildTemplate()) as {
      Resources: Record<string, unknown>;
      Outputs: Record<string, unknown>;
      Parameters: Record<string, unknown>;
    };

    expect(template.Resources.ApiGatewayRestApi).toBeDefined();
    expect(template.Resources.IngressQueue).toBeDefined();
    expect(template.Resources.WebhookEcsCluster).toBeDefined();
    expect(template.Resources.WebhookTaskDefinition).toBeDefined();
    expect(template.Resources.ForwarderLambdaFunction).toBeDefined();
    expect(template.Resources.QueueToLambdaEventSourceMapping).toBeDefined();
    expect(template.Parameters.WebhookSecret).toBeDefined();
    expect(template.Parameters.LambdaCodeS3Bucket).toBeDefined();
    expect(template.Outputs.ApiInvokeUrl).toBeDefined();
  });
});
