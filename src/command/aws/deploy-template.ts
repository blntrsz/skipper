import { createHash } from "node:crypto";
import {
  listWorkerChunkParameterKeys,
  WORKERS_CHUNK_COUNT_PARAM,
  WORKERS_ENCODING_PARAM,
  WORKERS_SCHEMA_VERSION_PARAM,
  WORKERS_SHA256_PARAM,
} from "../../worker/aws-params.js";
import type { WorkerGithubEventSubscription } from "../../worker/github-events.js";

type JsonMap = Record<string, unknown>;

export type BuildDeployTemplateInput = {
  workerSubscriptions: WorkerGithubEventSubscription[];
};

/**
 * Build repo-scoped deploy template JSON string.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
export function buildDeployTemplate(input: BuildDeployTemplateInput): string {
  const workerSubscriptions = [...input.workerSubscriptions].sort((left, right) =>
    left.workerId.localeCompare(right.workerId),
  );
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Skipper repository-scoped EventBridge subscription",
    Parameters: buildParameters(),
    Resources: buildResources(workerSubscriptions),
    Outputs: buildOutputs(workerSubscriptions),
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
    GitHubAppId: { Type: "String" },
    GitHubAppPrivateKeySsmParameterName: {
      Type: "String",
      AllowedPattern: "^/.*",
      ConstraintDescription: "must start with /",
    },
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
function buildResources(workerSubscriptions: WorkerGithubEventSubscription[]): JsonMap {
  const resources: JsonMap = {
    ...buildSharedResources(),
  };
  for (const subscription of workerSubscriptions) {
    Object.assign(resources, buildWorkerResources(subscription));
  }
  return resources;
}

/**
 * Build resources shared by all worker Lambda subscriptions.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildSharedResources(): JsonMap {
  return {
    RepositoryWorkerLambdaRole: {
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
            PolicyName: "repository-worker-lambda",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                  Resource: {
                    "Fn::Sub":
                      "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*:*",
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
                {
                  Effect: "Allow",
                  Action: ["ssm:GetParameter"],
                  Resource: {
                    "Fn::Sub":
                      "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter${GitHubAppPrivateKeySsmParameterName}",
                  },
                },
                {
                  Effect: "Allow",
                  Action: ["kms:Decrypt"],
                  Resource: "*",
                  Condition: {
                    StringEquals: {
                      "kms:ViaService": {
                        "Fn::Sub": "ssm.${AWS::Region}.amazonaws.com",
                      },
                    },
                    StringLike: {
                      "kms:EncryptionContext:PARAMETER_ARN": {
                        "Fn::Sub":
                          "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter${GitHubAppPrivateKeySsmParameterName}",
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

/**
 * Build resources for one worker-specific Lambda subscription.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildWorkerResources(subscription: WorkerGithubEventSubscription): JsonMap {
  const eventNames = subscription.events
    .map((event) => event.trim())
    .filter((event) => event.length > 0);
  if (eventNames.length === 0) {
    return {};
  }
  const logicalPrefix = buildWorkerLogicalId(subscription.workerId);
  const logGroupLogicalId = `${logicalPrefix}LambdaLogGroup`;
  const lambdaLogicalId = `${logicalPrefix}LambdaFunction`;
  const eventRuleLogicalId = `${logicalPrefix}EventRule`;
  const permissionLogicalId = `${logicalPrefix}LambdaInvokePermission`;
  const targetId = `worker-${sha1Suffix(subscription.workerId).slice(0, 12)}`;
  return {
    [logGroupLogicalId]: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: {
          "Fn::Sub": `/aws/lambda/\${${lambdaLogicalId}}`,
        },
        RetentionInDays: 14,
      },
    },
    [lambdaLogicalId]: {
      Type: "AWS::Lambda::Function",
      Properties: {
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: { "Fn::GetAtt": ["RepositoryWorkerLambdaRole", "Arn"] },
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
            GITHUB_APP_ID: { Ref: "GitHubAppId" },
            GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER: {
              Ref: "GitHubAppPrivateKeySsmParameterName",
            },
            SKIPPER_WORKER_ID: subscription.workerId,
          },
        },
      },
    },
    [eventRuleLogicalId]: {
      Type: "AWS::Events::Rule",
      Properties: {
        Description: `Skipper worker ${subscription.workerId} repository subscription`,
        EventBusName: { Ref: "EventBusName" },
        State: "ENABLED",
        EventPattern: {
          source: [{ Ref: "EventSource" }],
          "detail-type": [{ Ref: "EventDetailType" }],
          detail: {
            repository: {
              full_name: [{ Ref: "RepositoryFullName" }],
            },
            headers: {
              "x-github-event": eventNames,
            },
          },
        },
        Targets: [
          {
            Arn: { "Fn::GetAtt": [lambdaLogicalId, "Arn"] },
            Id: targetId,
          },
        ],
      },
    },
    [permissionLogicalId]: {
      Type: "AWS::Lambda::Permission",
      Properties: {
        FunctionName: { Ref: lambdaLogicalId },
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: { "Fn::GetAtt": [eventRuleLogicalId, "Arn"] },
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
function buildOutputs(workerSubscriptions: WorkerGithubEventSubscription[]): JsonMap {
  return {
    RepositoryFullName: { Value: { Ref: "RepositoryFullName" } },
    WorkerSubscriptionCount: {
      Value: String(workerSubscriptions.length),
    },
  };
}

/**
 * Build stable CloudFormation logical id prefix from worker id.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function buildWorkerLogicalId(workerId: string): string {
  const base = toPascalCase(workerId).slice(0, 40);
  return `Worker${base}${sha1Suffix(workerId).slice(0, 8)}`;
}

/**
 * Convert kebab/slug string to PascalCase alnum value.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function toPascalCase(value: string): string {
  const parts = value.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "Worker";
  }
  return parts
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join("");
}

/**
 * Build stable sha1 hex suffix.
 *
 * @since 1.0.0
 * @category AWS.DeployTemplate
 */
function sha1Suffix(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
