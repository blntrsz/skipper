import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { EC2Client } from "@aws-sdk/client-ec2";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import type { Command } from "commander";
import { deployStack, getFailureSummary } from "./cloudformation.js";
import {
  FORWARDER_LAMBDA_ZIP_SHA256,
  getForwarderLambdaZipBytes,
} from "./lambda-source.js";
import { resolveGithubRepo, upsertGithubWebhook } from "./github.js";
import { discoverDefaultNetwork } from "./network.js";
import { buildTemplate } from "./template.js";

const DEFAULT_ENV = "sandbox";
const DEFAULT_REGION = "us-east-1";

type DeployOptions = {
  region?: string;
  profile?: string;
  stackName?: string;
  queueName?: string;
  apiName?: string;
  stageName?: string;
  timeoutMinutes: number;
  dryRunTemplate?: boolean;
  tags?: string;
  githubRepo?: string;
  githubEvents?: string;
  githubSecret?: string;
  skipGithubWebhook?: boolean;
};

export function registerAwsDeployCommand(program: Command) {
  program
    .command("deploy")
    .description("Deploy AWS infrastructure with CloudFormation")
    .argument("[service]", "Service name (default: current directory)")
    .argument("[env]", "Environment (default: AWS_PROFILE or sandbox)")
    .option(
      "--region <region>",
      "AWS region (default: AWS_REGION/AWS_DEFAULT_REGION/us-east-1)",
    )
    .option("--profile <profile>", "AWS profile")
    .option("--stack-name <name>", "CloudFormation stack name")
    .option("--queue-name <name>", "SQS queue name")
    .option("--api-name <name>", "API Gateway name")
    .option("--stage-name <name>", "API Gateway stage name")
    .option("--timeout-minutes <n>", "Wait timeout minutes", parseNumber, 30)
    .option("--tags <k=v,...>", "Stack tags")
    .option(
      "--github-repo <owner/repo>",
      "GitHub repo for webhook (default: current git repo)",
    )
    .option("--github-events <events>", "Webhook events csv (default: *)")
    .option("--github-secret <secret>", "Webhook secret override")
    .option("--skip-github-webhook", "Skip GitHub webhook upsert")
    .option("--dry-run-template", "Print template and parameters only")
    .action(
      async (
        serviceArg: string | undefined,
        envArg: string | undefined,
        options: DeployOptions,
      ) => {
        const defaults = resolveDeployDefaults();
        const service = serviceArg ?? defaults.service;
        const env = envArg ?? defaults.env;
        const region = options.region ?? defaults.region;
        const githubRepo = options.skipGithubWebhook
          ? undefined
          : await resolveGithubRepo(options.githubRepo);
        const githubEvents = parseGithubEvents(options.githubEvents);
        const webhookSecret =
          options.githubSecret ?? createWebhookSecret(service, env);

        validateInput(service, env);
        if (!options.skipGithubWebhook && !githubRepo) {
          throw new Error("github repo not found from current repo; pass --github-repo");
        }

        const stackName = options.stackName ?? `${service}-${env}`;
        const queueName = options.queueName ?? `${service}-${env}-events`;
        const apiName = options.apiName ?? `${service}-${env}-events-api`;
        const stageName = options.stageName ?? env;
        const templateBody = buildTemplate();

        if (options.dryRunTemplate) {
          console.log(
            JSON.stringify(
              {
                stackName,
                region,
                lambdaArtifactSha256: FORWARDER_LAMBDA_ZIP_SHA256,
                githubWebhook: options.skipGithubWebhook
                  ? { enabled: false }
                  : {
                      enabled: true,
                      repo: githubRepo,
                      events: githubEvents,
                      secretConfigured: Boolean(webhookSecret),
                    },
                template: JSON.parse(templateBody),
              },
              null,
              2,
            ),
          );
          return;
        }

        const previousProfile = process.env.AWS_PROFILE;
        if (options.profile) process.env.AWS_PROFILE = options.profile;

        try {
          const sts = new STSClient({ region });
          const identity = await sts.send(new GetCallerIdentityCommand({}));
          const accountId = identity.Account;
          if (!accountId) throw new Error("cannot resolve AWS account id");

          const ec2 = new EC2Client({ region });
          const network = await discoverDefaultNetwork(ec2);

          const lambdaBucket = `skipper-lambda-artifacts-${accountId}-${region}`;
          const lambdaKey = `lambda/${service}/${env}/${FORWARDER_LAMBDA_ZIP_SHA256}.zip`;

          const s3 = new S3Client({ region });
          await ensureBucket(s3, lambdaBucket, region);
          await s3.send(
            new PutObjectCommand({
              Bucket: lambdaBucket,
              Key: lambdaKey,
              Body: getForwarderLambdaZipBytes(),
            }),
          );

          const parameters = {
            ServiceName: service,
            Environment: env,
            QueueName: queueName,
            ApiName: apiName,
            StageName: stageName,
            VpcId: network.vpcId,
            SubnetIds: network.subnetIds.join(","),
            LambdaCodeS3Bucket: lambdaBucket,
            LambdaCodeS3Key: lambdaKey,
            WebhookSecret: webhookSecret,
          };

          const client = new CloudFormationClient({ region });
          const result = await deployStack({
            client,
            stackName,
            templateBody,
            parameters,
            timeoutMinutes: options.timeoutMinutes,
            tags: parseTags(options.tags),
          });

          console.log(
            `Stack ${stackName} ${result.action === "noop" ? "unchanged" : "deployed"}`,
          );
          for (const output of result.outputs) {
            if (output.OutputKey && output.OutputValue) {
              console.log(`${output.OutputKey}: ${output.OutputValue}`);
            }
          }

          if (!options.skipGithubWebhook) {
            const apiInvokeUrl = getRequiredOutput(result.outputs, "ApiInvokeUrl");
            const hook = await upsertGithubWebhook({
              repo: githubRepo!,
              webhookUrl: apiInvokeUrl,
              events: githubEvents,
              secret: webhookSecret,
            });
            console.log(`GitHub webhook ${hook.action}: ${githubRepo} -> ${apiInvokeUrl}`);
            console.log("GitHub webhook secret rotated");
          }
        } catch (error) {
          console.error(
            `Deploy failed: ${error instanceof Error ? error.message : error}`,
          );
          const client = new CloudFormationClient({ region });
          const details = await getFailureSummary(client, stackName).catch(() => []);
          for (const line of details) console.error(`- ${line}`);
          process.exit(1);
        } finally {
          if (options.profile) {
            if (previousProfile === undefined) {
              delete process.env.AWS_PROFILE;
            } else {
              process.env.AWS_PROFILE = previousProfile;
            }
          }
        }
      },
    );
}

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("timeout must be positive integer");
  }
  return parsed;
}

function validateInput(service: string, env: string) {
  if (!isSimpleName(service)) {
    throw new Error("service must match [a-zA-Z0-9-]+");
  }
  if (!isSimpleName(env)) {
    throw new Error("env must match [a-zA-Z0-9-]+");
  }
}

function isSimpleName(value: string) {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

export type DeployDefaults = {
  service: string;
  env: string;
  region: string;
};

export function resolveDeployDefaults(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): DeployDefaults {
  const service =
    toSimpleName(env.SKIPPER_AWS_SERVICE ?? "") ||
    toSimpleName(basename(cwd)) ||
    "skipper";
  const deployEnv =
    toSimpleName(env.SKIPPER_AWS_ENV ?? "") ||
    toSimpleName(env.AWS_PROFILE ?? "") ||
    DEFAULT_ENV;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? DEFAULT_REGION;

  return {
    service,
    env: deployEnv,
    region,
  };
}

function toSimpleName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function parseGithubEvents(value?: string): string[] {
  if (!value || value.trim().length === 0) return ["*"];

  const events = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (events.length === 0) return ["*"];
  for (const event of events) {
    if (!/^[a-z0-9_*.-]+$/i.test(event)) {
      throw new Error(`invalid github event: ${event}`);
    }
  }
  return events;
}

function getRequiredOutput(
  outputs: Array<{ OutputKey?: string; OutputValue?: string }>,
  key: string,
): string {
  const value = outputs.find((output) => output.OutputKey === key)?.OutputValue;
  if (!value) throw new Error(`Missing CloudFormation output: ${key}`);
  return value;
}

export function parseTags(value?: string): Record<string, string> | undefined {
  if (!value) return undefined;

  const entries = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (entries.length === 0) return undefined;

  const tags: Record<string, string> = {};
  for (const entry of entries) {
    const [key, ...rest] = entry.split("=");
    const cleanKey = key?.trim();
    const cleanValue = rest.join("=").trim();
    if (!cleanKey || cleanValue.length === 0) {
      throw new Error(`invalid tag: ${entry}`);
    }
    tags[cleanKey] = cleanValue;
  }
  return tags;
}

async function ensureBucket(
  client: S3Client,
  bucket: string,
  region: string,
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    const command =
      region === "us-east-1"
        ? new CreateBucketCommand({ Bucket: bucket })
        : new CreateBucketCommand({
            Bucket: bucket,
            CreateBucketConfiguration: { LocationConstraint: region },
          });
    await client.send(command);
  }
}

function createWebhookSecret(service: string, env: string): string {
  return `${service}-${env}-${randomBytes(24).toString("hex")}`;
}
