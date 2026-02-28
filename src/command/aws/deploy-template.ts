type JsonMap = Record<string, unknown>;

/**
 * Build repo-scoped deploy template JSON string.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
export function buildDeployTemplate(): string {
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Skipper repository-scoped EventBridge subscription",
    Parameters: buildParameters(),
    Resources: buildResources(),
    Outputs: buildOutputs(),
  };
  return JSON.stringify(template, null, 2);
}

/**
 * Build deploy template parameters.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildParameters(): JsonMap {
  return {
    ServiceName: { Type: "String" },
    Environment: { Type: "String" },
    RepositoryFullName: { Type: "String" },
    RepositoryPrefix: { Type: "String" },
    EventBusName: { Type: "String" },
    EventSource: { Type: "String" },
    EventDetailType: { Type: "String" },
  };
}

/**
 * Build deploy template resources.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildResources(): JsonMap {
  return {
    RepositoryEventRule: {
      Type: "AWS::Events::Rule",
      Properties: {
        Name: {
          "Fn::Sub": "${RepositoryPrefix}-${ServiceName}-${Environment}-repo-events",
        },
        Description: {
          "Fn::Sub": "Skipper repository filter for ${RepositoryFullName}",
        },
        EventBusName: { Ref: "EventBusName" },
        State: "ENABLED",
        EventPattern: {
          source: [{ Ref: "EventSource" }],
          "detail-type": [{ Ref: "EventDetailType" }],
          detail: {
            repository: {
              full_name: [{ Ref: "RepositoryFullName" }],
            },
          },
        },
      },
    },
  };
}

/**
 * Build deploy template outputs.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildOutputs(): JsonMap {
  return {
    RepositoryEventRuleName: { Value: { Ref: "RepositoryEventRule" } },
    RepositoryEventRuleArn: {
      Value: { "Fn::GetAtt": ["RepositoryEventRule", "Arn"] },
    },
    RepositoryFullName: { Value: { Ref: "RepositoryFullName" } },
  };
}
