import { CloudFormationClient, type Output } from "@aws-sdk/client-cloudformation";
import { EC2Client } from "@aws-sdk/client-ec2";
import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import type { Command } from "commander";
import { parseUnknownJson } from "../../shared/validation/parse-json.js";
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
  prompt?: string;
  githubToken?: string;
  anthropicApiKey?: string;
  skipGithubWebhook?: boolean;
};

type DeployContext = {
  service: string;
  env: string;
  region: string;
  stackName: string;
  queueName: string;
  apiName: string;
  stageName: string;
  githubRepo?: string;
  githubEvents: string[];
  webhookSecret: string;
  prompt: string;
  githubToken: string;
  anthropicApiKey: string;
  timeoutMinutes: number;
  tags?: Record<string, string>;
  skipGithubWebhook: boolean;
};

export type DeployDefaults = {
  service: string;
  env: string;
  region: string;
};

/**
 * Register AWS deploy command.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
export function registerAwsDeployCommand(program: Command): void {
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
    .option("--prompt <prompt>", "Prompt fallback if webhook has no prompt")
    .option("--github-token <token>", "GitHub token for private repo clone")
    .option("--anthropic-api-key <key>", "Anthropic API key for claude auth")
    .option("--skip-github-webhook", "Skip GitHub webhook upsert")
    .option("--dry-run-template", "Print template and parameters only")
    .action(handleDeployAction);
}

/**
 * Execute deploy command action.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function handleDeployAction(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: DeployOptions,
): Promise<void> {
  const context = await buildDeployContext(serviceArg, envArg, options);
  const templateBody = buildTemplate();
  if (options.dryRunTemplate) {
    printDryRun(templateBody, context);
    return;
  }
  await runDeployWithProfile(options.profile, async () => {
    await executeDeploy(templateBody, context);
  });
}

/**
 * Build normalized deploy context.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function buildDeployContext(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: DeployOptions,
): Promise<DeployContext> {
  const defaults = resolveDeployDefaults();
  const service = serviceArg ?? defaults.service;
  const env = envArg ?? defaults.env;
  const region = options.region ?? defaults.region;
  const skipGithubWebhook = options.skipGithubWebhook ?? false;
  const githubRepo = skipGithubWebhook
    ? undefined
    : await resolveGithubRepo(options.githubRepo);
  const githubEvents = parseGithubEvents(options.githubEvents);
  const webhookSecret = options.githubSecret ?? createWebhookSecret(service, env);
  const prompt = options.prompt ?? process.env.PROMPT ?? "";
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN ?? "";
  const anthropicApiKey =
    options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  validateInput(service, env);
  assertWebhookRepo(skipGithubWebhook, githubRepo);
  return {
    service,
    env,
    region,
    stackName: options.stackName ?? `${service}-${env}`,
    queueName: options.queueName ?? `${service}-${env}-events`,
    apiName: options.apiName ?? `${service}-${env}-events-api`,
    stageName: options.stageName ?? env,
    githubRepo,
    githubEvents,
    webhookSecret,
    prompt,
    githubToken,
    anthropicApiKey,
    timeoutMinutes: options.timeoutMinutes,
    tags: parseTags(options.tags),
    skipGithubWebhook,
  };
}

/**
 * Print dry-run deployment payload.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function printDryRun(templateBody: string, context: DeployContext): void {
  console.log(
    JSON.stringify(
      {
        stackName: context.stackName,
        region: context.region,
        lambdaArtifactSha256: FORWARDER_LAMBDA_ZIP_SHA256,
        githubWebhook: context.skipGithubWebhook
          ? { enabled: false }
          : {
              enabled: true,
              repo: context.githubRepo,
              events: context.githubEvents,
              secretConfigured: Boolean(context.webhookSecret),
            },
        runtime: {
          promptConfigured: context.prompt.length > 0,
          githubTokenConfigured: context.githubToken.length > 0,
          anthropicApiKeyConfigured: context.anthropicApiKey.length > 0,
        },
        template: parseUnknownJson(templateBody, "cloudformation template"),
      },
      null,
      2,
    ),
  );
}

/**
 * Run deploy body with optional profile.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function runDeployWithProfile(
  profile: string | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const previousProfile = process.env.AWS_PROFILE;
  if (profile) {
    process.env.AWS_PROFILE = profile;
  }
  try {
    await run();
  } finally {
    restoreAwsProfile(profile, previousProfile);
  }
}

/**
 * Restore AWS profile env state.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function restoreAwsProfile(
  profile: string | undefined,
  previousProfile: string | undefined,
): void {
  if (!profile) return;
  if (previousProfile === undefined) {
    delete process.env.AWS_PROFILE;
    return;
  }
  process.env.AWS_PROFILE = previousProfile;
}

/**
 * Execute deploy flow.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function executeDeploy(templateBody: string, context: DeployContext): Promise<void> {
  try {
    const artifact = await prepareLambdaArtifact(context);
    const client = new CloudFormationClient({ region: context.region });
    const result = await deployStack({
      client,
      stackName: context.stackName,
      templateBody,
      parameters: createTemplateParameters(context, artifact),
      timeoutMinutes: context.timeoutMinutes,
      tags: context.tags,
    });
    printDeployOutputs(context.stackName, result.action, result.outputs);
    await upsertWebhookIfEnabled(context, result.outputs);
  } catch (error) {
    await handleDeployError(error, context.stackName, context.region);
  }
}

type LambdaArtifactLocation = {
  bucket: string;
  key: string;
  vpcId: string;
  subnetIds: string[];
};

/**
 * Upload lambda artifact and resolve network values.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function prepareLambdaArtifact(
  context: DeployContext,
): Promise<LambdaArtifactLocation> {
  const accountId = await resolveAccountId(context.region);
  const ec2 = new EC2Client({ region: context.region });
  const network = await discoverDefaultNetwork(ec2);
  const bucket = `skipper-lambda-artifacts-${accountId}-${context.region}`;
  const key = `lambda/${context.service}/${context.env}/${FORWARDER_LAMBDA_ZIP_SHA256}.zip`;
  const s3 = new S3Client({ region: context.region });
  await ensureBucket(s3, bucket, context.region);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: getForwarderLambdaZipBytes(),
    }),
  );
  return {
    bucket,
    key,
    vpcId: network.vpcId,
    subnetIds: network.subnetIds,
  };
}

/**
 * Resolve AWS account id.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function resolveAccountId(region: string): Promise<string> {
  const sts = new STSClient({ region });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  if (!identity.Account) {
    throw new Error("cannot resolve AWS account id");
  }
  return identity.Account;
}

/**
 * Build CloudFormation parameters map.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function createTemplateParameters(
  context: DeployContext,
  artifact: LambdaArtifactLocation,
): Record<string, string> {
  return {
    ServiceName: context.service,
    Environment: context.env,
    QueueName: context.queueName,
    ApiName: context.apiName,
    StageName: context.stageName,
    VpcId: artifact.vpcId,
    SubnetIds: artifact.subnetIds.join(","),
    LambdaCodeS3Bucket: artifact.bucket,
    LambdaCodeS3Key: artifact.key,
    WebhookSecret: context.webhookSecret,
    Prompt: context.prompt,
    GitHubToken: context.githubToken,
    AnthropicApiKey: context.anthropicApiKey,
  };
}

/**
 * Print deploy stack output values.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function printDeployOutputs(
  stackName: string,
  action: "create" | "update" | "noop",
  outputs: Output[],
): void {
  console.log(`Stack ${stackName} ${action === "noop" ? "unchanged" : "deployed"}`);
  for (const output of outputs) {
    if (output.OutputKey && output.OutputValue) {
      console.log(`${output.OutputKey}: ${output.OutputValue}`);
    }
  }
}

/**
 * Upsert GitHub webhook when enabled.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function upsertWebhookIfEnabled(
  context: DeployContext,
  outputs: Output[],
): Promise<void> {
  if (context.skipGithubWebhook) return;
  const repo = requireValue(context.githubRepo, "github repo");
  const apiInvokeUrl = getRequiredOutput(outputs, "ApiInvokeUrl");
  const hook = await upsertGithubWebhook({
    repo,
    webhookUrl: apiInvokeUrl,
    events: context.githubEvents,
    secret: context.webhookSecret,
  });
  console.log(`GitHub webhook ${hook.action}: ${repo} -> ${apiInvokeUrl}`);
  console.log("GitHub webhook secret rotated");
}

/**
 * Handle deploy failure output.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function handleDeployError(
  error: unknown,
  stackName: string,
  region: string,
): Promise<never> {
  console.error(`Deploy failed: ${error instanceof Error ? error.message : error}`);
  const client = new CloudFormationClient({ region });
  const details = await getFailureSummary(client, stackName).catch(() => []);
  for (const line of details) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

/**
 * Parse positive number option.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("timeout must be positive integer");
  }
  return parsed;
}

/**
 * Validate deploy service/env names.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function validateInput(service: string, env: string): void {
  if (!isSimpleName(service)) {
    throw new Error("service must match [a-zA-Z0-9-]+");
  }
  if (!isSimpleName(env)) {
    throw new Error("env must match [a-zA-Z0-9-]+");
  }
}

/**
 * Validate simple slug-like value.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function isSimpleName(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

/**
 * Resolve default deploy inputs from cwd + env.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
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
  return { service, env: deployEnv, region };
}

/**
 * Normalize value into simple name.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function toSimpleName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

/**
 * Parse webhook events CSV.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
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

/**
 * Parse stack tags CSV.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
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

/**
 * Ensure webhook repo exists when enabled.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function assertWebhookRepo(
  skipGithubWebhook: boolean,
  githubRepo: string | undefined,
): void {
  if (!skipGithubWebhook && !githubRepo) {
    throw new Error("github repo not found from current repo; pass --github-repo");
  }
}

/**
 * Get required stack output value.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function getRequiredOutput(
  outputs: Array<{ OutputKey?: string; OutputValue?: string }>,
  key: string,
): string {
  const value = outputs.find((output) => output.OutputKey === key)?.OutputValue;
  if (!value) {
    throw new Error(`Missing CloudFormation output: ${key}`);
  }
  return value;
}

/**
 * Ensure S3 bucket exists.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function ensureBucket(client: S3Client, bucket: string, region: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    const command =
      region === "us-east-1"
        ? new CreateBucketCommand({ Bucket: bucket })
        : new CreateBucketCommand({
            Bucket: bucket,
            CreateBucketConfiguration: {
              LocationConstraint: toBucketLocationConstraint(region),
            },
          });
    await client.send(command);
  }
}

/**
 * Convert region string to bucket location enum.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function toBucketLocationConstraint(region: string): BucketLocationConstraint {
  return region as BucketLocationConstraint;
}

/**
 * Create random webhook secret.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function createWebhookSecret(service: string, env: string): string {
  return `${service}-${env}-${randomBytes(24).toString("hex")}`;
}

/**
 * Require optional value.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`missing ${label}`);
  }
  return value;
}
