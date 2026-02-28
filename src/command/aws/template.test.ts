import { describe, expect, test } from "bun:test";
import { buildTemplate } from "./template.js";

describe("buildTemplate", () => {
  test("contains apigw + eventbridge + ecs resources", () => {
    const template = JSON.parse(buildTemplate()) as {
      Resources: Record<string, any>;
      Outputs: Record<string, unknown>;
      Parameters: Record<string, any>;
    };

    expect(template.Resources.ApiGatewayRestApi).toBeDefined();
    expect(template.Resources.ApiGatewayToEventBridgeRole).toBeDefined();
    expect(template.Resources.IngressEventBus).toBeDefined();
    expect(template.Parameters.WebhookSecret).toBeDefined();
    expect(template.Parameters.VpcId).toBeDefined();
    expect(template.Parameters.SubnetIds).toBeDefined();
    expect(template.Parameters.EventBusName).toBeDefined();
    expect(template.Parameters.EventSource).toBeDefined();
    expect(template.Parameters.EventDetailType).toBeDefined();
    expect(template.Parameters.WorkersSha256).toBeDefined();
    expect(template.Parameters.WorkersChunk00).toBeDefined();

    expect(template.Outputs.ApiInvokeUrl).toBeDefined();
    expect(template.Outputs.EventBusArn).toBeDefined();
    expect(template.Outputs.EventBusName).toBeDefined();
    expect(template.Outputs.EventSource).toBeDefined();
    expect(template.Outputs.EventDetailType).toBeDefined();
    expect(template.Outputs.EcsClusterArn).toBeDefined();
    expect(template.Outputs.EcsTaskDefinitionArn).toBeDefined();
    expect(template.Outputs.EcsSecurityGroupId).toBeDefined();
    expect(template.Outputs.EcsSubnetIdsCsv).toBeDefined();

    expect(template.Resources.IngressQueue).toBeUndefined();
    expect(template.Resources.ForwarderLambdaFunction).toBeUndefined();
    expect(template.Resources.WebhookEcsCluster).toBeDefined();
    expect(template.Resources.WebhookTaskDefinition).toBeDefined();

    const method = template.Resources.ApiGatewayMethodPostEvents;
    const integration = method.Properties.Integration;
    expect(integration.Uri["Fn::Sub"]).toContain("events:action/PutEvents");
    expect(integration.RequestTemplates["application/json"]["Fn::Sub"][0]).toContain(
      "AWSEvents.PutEvents",
    );
    expect(integration.RequestTemplates["application/json"]["Fn::Sub"][0]).toContain(
      "repository",
    );
    expect(integration.RequestTemplates["application/json"]["Fn::Sub"][0]).toContain(
      "full_name",
    );

    const rolePolicy = template.Resources.ApiGatewayToEventBridgeRole.Properties.Policies[0];
    const policyActions = rolePolicy.PolicyDocument.Statement[0].Action;
    expect(policyActions).toContain("events:PutEvents");
  });
});
