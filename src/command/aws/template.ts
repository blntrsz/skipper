import {
  listWorkerChunkParameterKeys,
  WORKERS_CHUNK_COUNT_PARAM,
  WORKERS_ENCODING_PARAM,
  WORKERS_SCHEMA_VERSION_PARAM,
  WORKERS_SHA256_PARAM,
} from "../../worker/aws-params.js";

type JsonMap = Record<string, unknown>;

const WEBHOOK_TASK_COMMAND = [
  "set -euo pipefail",
  "apt-get update",
  "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
  "DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates unzip nodejs",
  'REPO_URL="$REPOSITORY_URL"',
  "id -u runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner",
  'runuser -u runner -- bash -lc "curl -fsSL https://bun.sh/install | bash"',
  'runuser -u runner -- env PATH="/home/runner/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -lc "bun add -g @anthropic-ai/claude-code opencode-ai"',
  'runuser -u runner -- env REPO_URL="$REPO_URL" PROMPT="$PROMPT" ECS_AGENT="${ECS_AGENT:-claude}" GITHUB_TOKEN="${GITHUB_TOKEN:-}" ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" PATH="/home/runner/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -lc \"if [ -n \\\"${GITHUB_TOKEN:-}\\\" ] && [ \\\"${REPO_URL#https://github.com/}\\\" != \\\"$REPO_URL\\\" ]; then REPO_URL=\\\"https://x-access-token:${GITHUB_TOKEN:-}@${REPO_URL#https://}\\\"; fi; rm -rf /home/runner/repo; git clone --depth 1 \\\"$REPO_URL\\\" /home/runner/repo; cd /home/runner/repo; if [ \\\"${ECS_AGENT}\\\" = \\\"opencode\\\" ]; then opencode run \\\"$PROMPT\\\"; else claude --dangerously-skip-permissions -p \\\"$PROMPT\\\"; fi\"',
].join("; ");

const DEFAULT_BEDROCK_MODEL = "eu.anthropic.claude-sonnet-4-6";

const EVENTBRIDGE_REQUEST_TEMPLATE = [
  '#set($context.requestOverride.header.X-Amz-Target = "AWSEvents.PutEvents")',
  '#set($context.requestOverride.header.Content-Type = "application/x-amz-json-1.1")',
  "{",
  '  "Entries": [',
  "    {",
  '      "Source": "${EventSource}",',
  '      "DetailType": "${EventDetailType}",',
  '      "EventBusName": "${EventBusName}",',
  '      "Detail": "{\\"rawBodyB64\\":\\"$util.base64Encode($input.body)\\",\\"headers\\":{\\"x-github-event\\":\\"$util.escapeJavaScript($input.params().header.get(\'X-GitHub-Event\'))\\",\\"x-github-delivery\\":\\"$util.escapeJavaScript($input.params().header.get(\'X-GitHub-Delivery\'))\\",\\"x-hub-signature-256\\":\\"$util.escapeJavaScript($input.params().header.get(\'X-Hub-Signature-256\'))\\"},\\"repository\\":{\\"full_name\\":\\"$util.escapeJavaScript($util.parseJson($input.body).repository.full_name)\\"},\\"requestId\\":\\"$context.requestId\\"}"',
  "    }",
  "  ]",
  "}",
].join("\n");

/**
 * Build CloudFormation template JSON string.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
export function buildTemplate(): string {
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Skipper API Gateway REST -> EventBridge",
    Parameters: buildParameters(),
    Resources: buildResources(),
    Outputs: buildOutputs(),
  };
  return JSON.stringify(template, null, 2);
}

/**
 * Build template parameters section.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildParameters(): JsonMap {
  return {
    ServiceName: { Type: "String" },
    Environment: { Type: "String" },
    ApiName: { Type: "String" },
    StageName: { Type: "String" },
    VpcId: { Type: "String" },
    SubnetIds: { Type: "CommaDelimitedList" },
    EventBusName: { Type: "String" },
    EventSource: { Type: "String" },
    EventDetailType: { Type: "String" },
    WebhookSecret: { Type: "String", NoEcho: true },
    ...buildWorkerParameters(),
  };
}

/**
 * Build worker manifest CloudFormation parameters.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildWorkerParameters(): JsonMap {
  const parameters: JsonMap = {
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
 * Build template outputs section.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildOutputs(): JsonMap {
  return {
    ApiInvokeUrl: {
      Value: {
        "Fn::Sub":
          "https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${StageName}/events",
      },
    },
    ApiId: { Value: { Ref: "ApiGatewayRestApi" } },
    ApiStageName: { Value: { Ref: "StageName" } },
    EventBusName: { Value: { Ref: "IngressEventBus" } },
    EventBusArn: { Value: { "Fn::GetAtt": ["IngressEventBus", "Arn"] } },
    EventSource: { Value: { Ref: "EventSource" } },
    EventDetailType: { Value: { Ref: "EventDetailType" } },
    EcsClusterArn: { Value: { Ref: "WebhookEcsCluster" } },
    EcsTaskDefinitionArn: { Value: { Ref: "WebhookTaskDefinition" } },
    EcsSecurityGroupId: { Value: { Ref: "WebhookTaskSecurityGroup" } },
    EcsSubnetIdsCsv: { Value: { "Fn::Join": [",", { Ref: "SubnetIds" }] } },
  };
}

/**
 * Build all resources.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildResources(): JsonMap {
  return {
    IngressEventBus: {
      Type: "AWS::Events::EventBus",
      Properties: {
        Name: { Ref: "EventBusName" },
      },
    },
    ApiGatewayToEventBridgeRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "apigateway.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "put-events",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["events:PutEvents"],
                  Resource: { "Fn::GetAtt": ["IngressEventBus", "Arn"] },
                },
              ],
            },
          },
        ],
      },
    },
    ApiGatewayRestApi: {
      Type: "AWS::ApiGateway::RestApi",
      Properties: {
        Name: { Ref: "ApiName" },
        EndpointConfiguration: { Types: ["REGIONAL"] },
      },
    },
    ApiGatewayResourceEvents: {
      Type: "AWS::ApiGateway::Resource",
      Properties: {
        RestApiId: { Ref: "ApiGatewayRestApi" },
        ParentId: { "Fn::GetAtt": ["ApiGatewayRestApi", "RootResourceId"] },
        PathPart: "events",
      },
    },
    ApiGatewayMethodPostEvents: {
      Type: "AWS::ApiGateway::Method",
      Properties: {
        RestApiId: { Ref: "ApiGatewayRestApi" },
        ResourceId: { Ref: "ApiGatewayResourceEvents" },
        HttpMethod: "POST",
        AuthorizationType: "NONE",
        RequestParameters: {
          "method.request.header.X-Amz-Target": false,
          "method.request.header.Content-Type": false,
        },
        Integration: {
          Type: "AWS",
          IntegrationHttpMethod: "POST",
          Credentials: { "Fn::GetAtt": ["ApiGatewayToEventBridgeRole", "Arn"] },
          Uri: {
            "Fn::Sub":
              "arn:${AWS::Partition}:apigateway:${AWS::Region}:events:action/PutEvents",
          },
          PassthroughBehavior: "WHEN_NO_TEMPLATES",
          RequestTemplates: {
            "application/json": {
              "Fn::Sub": [
                EVENTBRIDGE_REQUEST_TEMPLATE,
                {
                  EventBusName: { Ref: "EventBusName" },
                  EventSource: { Ref: "EventSource" },
                  EventDetailType: { Ref: "EventDetailType" },
                },
              ],
            },
          },
          IntegrationResponses: [
            {
              StatusCode: "200",
              ResponseTemplates: { "application/json": '{"ok":true}' },
            },
          ],
        },
        MethodResponses: [{ StatusCode: "200" }],
      },
    },
    ApiGatewayDeployment: {
      Type: "AWS::ApiGateway::Deployment",
      DependsOn: ["ApiGatewayMethodPostEvents"],
      Properties: { RestApiId: { Ref: "ApiGatewayRestApi" } },
    },
    ApiGatewayStage: {
      Type: "AWS::ApiGateway::Stage",
      Properties: {
        RestApiId: { Ref: "ApiGatewayRestApi" },
        DeploymentId: { Ref: "ApiGatewayDeployment" },
        StageName: { Ref: "StageName" },
      },
    },
    ...buildEcsResources(),
  };
}

/**
 * Build ECS resources for task execution runtime.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildEcsResources(): JsonMap {
  return {
    WebhookEcsCluster: {
      Type: "AWS::ECS::Cluster",
      Properties: {
        ClusterName: { "Fn::Sub": "${ServiceName}-${Environment}-cluster" },
      },
    },
    WebhookTaskLogGroup: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: {
          "Fn::Sub": "/aws/ecs/${ServiceName}-${Environment}-webhook",
        },
        RetentionInDays: 14,
      },
    },
    WebhookTaskExecutionRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        ManagedPolicyArns: [
          "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        ],
      },
    },
    WebhookTaskRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "claude-bedrock-access",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Sid: "AllowModelAndInferenceProfileAccess",
                  Effect: "Allow",
                  Action: [
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                    "bedrock:ListInferenceProfiles",
                  ],
                  Resource: [
                    "arn:aws:bedrock:*:*:inference-profile/*",
                    "arn:aws:bedrock:*:*:application-inference-profile/*",
                    "arn:aws:bedrock:*:*:foundation-model/*",
                  ],
                },
                {
                  Sid: "AllowMarketplaceSubscription",
                  Effect: "Allow",
                  Action: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
                  Resource: "*",
                  Condition: {
                    StringEquals: {
                      "aws:CalledViaLast": "bedrock.amazonaws.com",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    WebhookTaskSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: "Webhook ECS task security group",
        VpcId: { Ref: "VpcId" },
        SecurityGroupEgress: [
          {
            IpProtocol: "-1",
            CidrIp: "0.0.0.0/0",
          },
        ],
      },
    },
    WebhookTaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: { "Fn::Sub": "${ServiceName}-${Environment}-webhook" },
        Cpu: "256",
        Memory: "2048",
        NetworkMode: "awsvpc",
        RequiresCompatibilities: ["FARGATE"],
        ExecutionRoleArn: { "Fn::GetAtt": ["WebhookTaskExecutionRole", "Arn"] },
        TaskRoleArn: { "Fn::GetAtt": ["WebhookTaskRole", "Arn"] },
        ContainerDefinitions: [
          {
            Name: "webhook",
            Image: "public.ecr.aws/docker/library/ubuntu:24.04",
            Essential: true,
            Command: ["/bin/bash", "-lc", WEBHOOK_TASK_COMMAND],
            Environment: [
              { Name: "ECS_AGENT", Value: "claude" },
              { Name: "CLAUDE_CODE_USE_BEDROCK", Value: "1" },
              { Name: "AWS_REGION", Value: { Ref: "AWS::Region" } },
              { Name: "AWS_DEFAULT_REGION", Value: { Ref: "AWS::Region" } },
              { Name: "ANTHROPIC_MODEL", Value: DEFAULT_BEDROCK_MODEL },
              {
                Name: "ANTHROPIC_DEFAULT_SONNET_MODEL",
                Value: DEFAULT_BEDROCK_MODEL,
              },
            ],
            LogConfiguration: {
              LogDriver: "awslogs",
              Options: {
                "awslogs-group": { Ref: "WebhookTaskLogGroup" },
                "awslogs-region": { Ref: "AWS::Region" },
                "awslogs-stream-prefix": "ecs",
              },
            },
          },
        ],
      },
    },
  };
}
