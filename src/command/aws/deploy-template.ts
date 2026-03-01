import {
  listWorkerChunkParameterKeys,
  WORKERS_CHUNK_COUNT_PARAM,
  WORKERS_ENCODING_PARAM,
  WORKERS_SCHEMA_VERSION_PARAM,
  WORKERS_SHA256_PARAM,
} from "../../worker/aws-params.js";

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
  const parameters: JsonMap = {
    ServiceName: { Type: "String" },
    Environment: { Type: "String" },
    RepositoryFullName: { Type: "String" },
    RepositoryPrefix: { Type: "String" },
    EventBusName: { Type: "String" },
    EventSource: { Type: "String" },
    EventDetailType: { Type: "String" },
    EcsClusterArn: { Type: "String" },
    EcsTaskDefinitionArn: { Type: "String" },
    EcsSecurityGroupId: { Type: "String" },
    EcsSubnetIdsCsv: { Type: "String" },
    EcsTaskExecutionRoleArn: { Type: "String" },
    EcsTaskRoleArn: { Type: "String" },
    WebhookSecretParameterName: { Type: "String" },
    LambdaCodeS3Bucket: { Type: "String" },
    LambdaCodeS3Key: { Type: "String" },
    [WORKERS_ENCODING_PARAM]: { Type: "String", Default: "" },
    [WORKERS_SHA256_PARAM]: { Type: "String", Default: "" },
    [WORKERS_SCHEMA_VERSION_PARAM]: { Type: "String", Default: "1" },
    [WORKERS_CHUNK_COUNT_PARAM]: { Type: "Number", Default: 0 },
  };
  for (const key of listWorkerChunkParameterKeys()) {
    parameters[key] = { Type: "String", Default: "" };
  }
  return parameters;
}

/**
 * Build deploy template resources.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildResources(): JsonMap {
  return {
    RepositoryForwarderLambdaRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "repository-forwarder",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                  Resource: {
                    "Fn::Sub":
                      "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:${RepositoryForwarderLambdaLogGroup}:*",
                  },
                },
                {
                  Effect: "Allow",
                  Action: ["ecs:RunTask"],
                  Resource: { Ref: "EcsTaskDefinitionArn" },
                },
                {
                  Effect: "Allow",
                  Action: ["iam:PassRole"],
                  Resource: [{ Ref: "EcsTaskExecutionRoleArn" }, { Ref: "EcsTaskRoleArn" }],
                  Condition: {
                    StringEquals: {
                      "iam:PassedToService": "ecs-tasks.amazonaws.com",
                    },
                  },
                },
                {
                  Effect: "Allow",
                  Action: ["cloudformation:DescribeStacks"],
                  Resource: {
                    "Fn::Sub":
                      "arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${AWS::StackName}/*",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    RepositoryForwarderLambdaLogGroup: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: {
          "Fn::Sub": "/aws/lambda/${RepositoryPrefix}-${ServiceName}-${Environment}-repo-forwarder",
        },
        RetentionInDays: 14,
      },
    },
    RepositoryForwarderLambdaFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: {
          "Fn::Sub": "${RepositoryPrefix}-${ServiceName}-${Environment}-repo-forwarder",
        },
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: { "Fn::GetAtt": ["RepositoryForwarderLambdaRole", "Arn"] },
        Timeout: 30,
        MemorySize: 512,
        Code: {
          S3Bucket: { Ref: "LambdaCodeS3Bucket" },
          S3Key: { Ref: "LambdaCodeS3Key" },
        },
        Environment: {
          Variables: {
            ECS_CLUSTER_ARN: { Ref: "EcsClusterArn" },
            ECS_TASK_DEFINITION_ARN: { Ref: "EcsTaskDefinitionArn" },
            ECS_SECURITY_GROUP_ID: { Ref: "EcsSecurityGroupId" },
            ECS_SUBNET_IDS: { Ref: "EcsSubnetIdsCsv" },
            WORKERS_STACK_NAME: { Ref: "AWS::StackName" },
            WORKERS_ENCODING: { Ref: WORKERS_ENCODING_PARAM },
            WORKERS_SHA256: { Ref: WORKERS_SHA256_PARAM },
            WORKERS_SCHEMA_VERSION: { Ref: WORKERS_SCHEMA_VERSION_PARAM },
            WORKERS_CHUNK_COUNT: {
              "Fn::Join": ["", [{ Ref: WORKERS_CHUNK_COUNT_PARAM }]],
            },
            WEBHOOK_SECRET: {
              "Fn::Sub":
                "{{resolve:ssm:${WebhookSecretParameterName}}}",
            },
          },
        },
      },
    },
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
        Targets: [
          {
            Arn: { "Fn::GetAtt": ["RepositoryForwarderLambdaFunction", "Arn"] },
            Id: "RepositoryForwarderLambda",
          },
        ],
      },
    },
    RepositoryForwarderLambdaInvokePermission: {
      Type: "AWS::Lambda::Permission",
      Properties: {
        FunctionName: { Ref: "RepositoryForwarderLambdaFunction" },
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: { "Fn::GetAtt": ["RepositoryEventRule", "Arn"] },
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
    RepositoryForwarderLambdaName: {
      Value: { Ref: "RepositoryForwarderLambdaFunction" },
    },
    RepositoryForwarderLambdaArn: {
      Value: { "Fn::GetAtt": ["RepositoryForwarderLambdaFunction", "Arn"] },
    },
    RepositoryEventRuleName: { Value: { Ref: "RepositoryEventRule" } },
    RepositoryEventRuleArn: {
      Value: { "Fn::GetAtt": ["RepositoryEventRule", "Arn"] },
    },
    RepositoryFullName: { Value: { Ref: "RepositoryFullName" } },
  };
}
