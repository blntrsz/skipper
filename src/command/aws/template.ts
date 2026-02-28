const SQS_MESSAGE_TEMPLATE = [
  '{"rawBodyB64":"$util.base64Encode($input.body)",',
  '"headers":{',
  '"x-hub-signature-256":"$util.escapeJavaScript($input.params().header.get(\'X-Hub-Signature-256\'))",',
  '"x-github-event":"$util.escapeJavaScript($input.params().header.get(\'X-GitHub-Event\'))",',
  '"x-github-delivery":"$util.escapeJavaScript($input.params().header.get(\'X-GitHub-Delivery\'))"',
  "}}",
].join("");

const WEBHOOK_TASK_COMMAND = [
  "set -euo pipefail",
  "apt-get update",
  "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
  "DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates unzip nodejs",
  'REPO_URL="$REPOSITORY_URL"',
  "id -u runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner",
  'runuser -u runner -- bash -lc "curl -fsSL https://bun.sh/install | bash"',
  'runuser -u runner -- env PATH="/home/runner/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -lc "bun add -g @anthropic-ai/claude-code opencode-ai"',
  'runuser -u runner -- env REPO_URL="$REPO_URL" PROMPT="$PROMPT" GITHUB_TOKEN="${GITHUB_TOKEN:-}" ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" PATH="/home/runner/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -lc \"if [ -n \\\"${GITHUB_TOKEN:-}\\\" ] && [ \\\"${REPO_URL#https://github.com/}\\\" != \\\"$REPO_URL\\\" ]; then REPO_URL=\\\"https://x-access-token:${GITHUB_TOKEN:-}@${REPO_URL#https://}\\\"; fi; rm -rf /home/runner/repo; git clone --depth 1 \\\"$REPO_URL\\\" /home/runner/repo; cd /home/runner/repo; claude --dangerously-skip-permissions -p \\\"$PROMPT\\\"\"',
].join("; ");

type JsonMap = Record<string, unknown>;

/**
 * Build CloudFormation template JSON string.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
export function buildTemplate(): string {
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Skipper API Gateway -> SQS -> Lambda -> ECS task",
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
    QueueName: { Type: "String" },
    ApiName: { Type: "String" },
    StageName: { Type: "String" },
    VpcId: { Type: "String" },
    SubnetIds: { Type: "CommaDelimitedList" },
    LambdaCodeS3Bucket: { Type: "String" },
    LambdaCodeS3Key: { Type: "String" },
    WebhookSecret: { Type: "String", NoEcho: true },
    Prompt: { Type: "String", Default: "" },
    GitHubToken: { Type: "String", NoEcho: true, Default: "" },
    AnthropicApiKey: { Type: "String", NoEcho: true, Default: "" },
  };
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
    QueueUrl: { Value: { Ref: "IngressQueue" } },
    LambdaName: { Value: { Ref: "ForwarderLambdaFunction" } },
    EcsClusterArn: { Value: { Ref: "WebhookEcsCluster" } },
    EcsTaskDefinitionArn: { Value: { Ref: "WebhookTaskDefinition" } },
  };
}

/**
 * Build resources by composing resource groups.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildResources(): JsonMap {
  return {
    ...buildIngressResources(),
    ...buildApiResources(),
    ...buildEcsResources(),
    ...buildLambdaResources(),
  };
}

/**
 * Build ingress queue resources.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildIngressResources(): JsonMap {
  return {
    IngressQueueDlq: {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: { "Fn::Sub": "${QueueName}-dlq" },
      },
    },
    IngressQueue: {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: { Ref: "QueueName" },
        RedrivePolicy: {
          deadLetterTargetArn: { "Fn::GetAtt": ["IngressQueueDlq", "Arn"] },
          maxReceiveCount: 5,
        },
      },
    },
  };
}

/**
 * Build API Gateway resources.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildApiResources(): JsonMap {
  return {
    ApiGatewayToSqsRole: {
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
            PolicyName: "send-to-sqs",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["sqs:SendMessage"],
                  Resource: { "Fn::GetAtt": ["IngressQueue", "Arn"] },
                },
              ],
            },
          },
        ],
      },
    },
    ApiGatewayRestApi: {
      Type: "AWS::ApiGateway::RestApi",
      Properties: { Name: { Ref: "ApiName" } },
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
        Integration: {
          Type: "AWS",
          IntegrationHttpMethod: "POST",
          Credentials: { "Fn::GetAtt": ["ApiGatewayToSqsRole", "Arn"] },
          Uri: {
            "Fn::Sub":
              "arn:${AWS::Partition}:apigateway:${AWS::Region}:sqs:path/${AWS::AccountId}/${QueueName}",
          },
          RequestParameters: {
            "integration.request.header.Content-Type":
              "'application/x-www-form-urlencoded'",
          },
          RequestTemplates: {
            "application/json": `Action=SendMessage&MessageBody=$util.urlEncode(${SQS_MESSAGE_TEMPLATE})`,
          },
          PassthroughBehavior: "NEVER",
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
  };
}

/**
 * Build ECS resources.
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

/**
 * Build Lambda and event mapping resources.
 *
 * @since 1.0.0
 * @category AWS.Template
 */
function buildLambdaResources(): JsonMap {
  return {
    ForwarderLambdaRole: {
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
            PolicyName: "lambda-basic",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                  ],
                  Resource: "*",
                },
                {
                  Effect: "Allow",
                  Action: [
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                    "sqs:ChangeMessageVisibility",
                  ],
                  Resource: { "Fn::GetAtt": ["IngressQueue", "Arn"] },
                },
                {
                  Effect: "Allow",
                  Action: ["ecs:RunTask"],
                  Resource: { Ref: "WebhookTaskDefinition" },
                },
                {
                  Effect: "Allow",
                  Action: ["iam:PassRole"],
                  Resource: [
                    { "Fn::GetAtt": ["WebhookTaskExecutionRole", "Arn"] },
                    { "Fn::GetAtt": ["WebhookTaskRole", "Arn"] },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    ForwarderLambdaFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: { "Fn::Sub": "${ServiceName}-${Environment}-forwarder" },
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Timeout: 30,
        Role: { "Fn::GetAtt": ["ForwarderLambdaRole", "Arn"] },
        Environment: {
          Variables: {
            WEBHOOK_SECRET: { Ref: "WebhookSecret" },
            ECS_CLUSTER_ARN: { Ref: "WebhookEcsCluster" },
            ECS_TASK_DEFINITION_ARN: { Ref: "WebhookTaskDefinition" },
            ECS_SECURITY_GROUP_ID: { Ref: "WebhookTaskSecurityGroup" },
            ECS_SUBNET_IDS: { "Fn::Join": [",", { Ref: "SubnetIds" }] },
            ECS_ASSIGN_PUBLIC_IP: "ENABLED",
            ECS_CONTAINER_NAME: "webhook",
            PROMPT: { Ref: "Prompt" },
            GITHUB_TOKEN: { Ref: "GitHubToken" },
            ANTHROPIC_API_KEY: { Ref: "AnthropicApiKey" },
          },
        },
        Code: {
          S3Bucket: { Ref: "LambdaCodeS3Bucket" },
          S3Key: { Ref: "LambdaCodeS3Key" },
        },
      },
    },
    QueueToLambdaEventSourceMapping: {
      Type: "AWS::Lambda::EventSourceMapping",
      Properties: {
        EventSourceArn: { "Fn::GetAtt": ["IngressQueue", "Arn"] },
        FunctionName: { Ref: "ForwarderLambdaFunction" },
        Enabled: true,
        BatchSize: 10,
      },
    },
  };
}
