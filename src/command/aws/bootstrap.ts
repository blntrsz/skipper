import { CloudFormationClient, type Output } from "@aws-sdk/client-cloudformation";
import { EC2Client } from "@aws-sdk/client-ec2";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { randomBytes } from "node:crypto";
import type { Command } from "commander";
import { parseUnknownJson } from "../../shared/validation/parse-json.js";
import { collectGithubEventsFromWorkers } from "../../worker/github-events.js";
import { loadWorkers } from "../../worker/load.js";
import { encodeWorkerManifest } from "../../worker/serialize.js";
import {
  isSimpleName,
  parseTags,
  resolveDeployDefaults,
} from "./defaults.js";
import { deployStack, getFailureSummary } from "./cloudformation.js";
import { resolveGithubRepo, upsertGithubWebhook } from "./github.js";
import { discoverDefaultNetwork } from "./network.js";
import { buildTemplate } from "./template.js";

type BootstrapOptions = {
  region?: string;
  profile?: string;
  dir?: string;
  stackName?: string;
  apiName?: string;
  stageName?: string;
  timeoutMinutes: number;
  dryRunTemplate?: boolean;
  tags?: string;
  githubRepo?: string;
  githubEvents?: string;
  githubSecret?: string;
  githubAppId?: string;
  githubAppPrivateKeySsmParameter?: string;
  skipGithubWebhook?: boolean;
  strictWorkers?: boolean;
  eventBusName?: string;
  eventSource?: string;
  eventDetailType?: string;
};

type BootstrapContext = {
  rootDir: string;
  service: string;
  env: string;
  region: string;
  stackName: string;
  apiName: string;
  stageName: string;
  githubRepo?: string;
  githubEvents: string[];
  webhookSecret: string;
  githubAppId: string;
  githubAppPrivateKeySsmParameterName: string;
  workerCount: number;
  workerIds: string[];
  workerManifestByteLength: number;
  workerParameterValues: Record<string, string>;
  timeoutMinutes: number;
  tags?: Record<string, string>;
  skipGithubWebhook: boolean;
  eventBusName: string;
  eventSource: string;
  eventDetailType: string;
};

type BootstrapNetwork = {
  vpcId: string;
  subnetIds: string[];
};

/**
 * Register AWS bootstrap command.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
export function registerAwsBootstrapCommand(program: Command): void {
  const command = program
    .command("bootstrap")
    .description("Bootstrap AWS API Gateway -> EventBridge infrastructure");
  configureBootstrapCommand(command);
}

/**
 * Register AWS deploy command.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
export function registerAwsDeployAliasCommand(program: Command): void {
  const command = program
    .command("deploy")
    .description("Deploy AWS infrastructure with CloudFormation");
  configureBootstrapCommand(command);
}

/**
 * Configure shared options for bootstrap/deploy commands.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function configureBootstrapCommand(command: Command): void {
  command
    .argument("[service]", "Service name (default: current directory)")
    .argument("[env]", "Environment (default: AWS_PROFILE or sandbox)")
    .option(
      "--region <region>",
      "AWS region (default: AWS_REGION/AWS_DEFAULT_REGION/us-east-1)",
    )
    .option("--profile <profile>", "AWS profile")
    .option("--dir <path>", "Repository root directory (default: cwd)")
    .option("--stack-name <name>", "CloudFormation stack name")
    .option("--api-name <name>", "API Gateway name")
    .option("--stage-name <name>", "API Gateway stage name")
    .option("--event-bus-name <name>", "EventBridge bus name")
    .option("--event-source <source>", "EventBridge source")
    .option("--event-detail-type <type>", "EventBridge detail-type")
    .option("--timeout-minutes <n>", "Wait timeout minutes", parseNumber, 30)
    .option("--tags <k=v,...>", "Stack tags")
    .option(
      "--github-repo <owner/repo>",
      "GitHub repo for webhook (default: current git repo)",
    )
    .option("--github-events <events>", "Webhook events csv (default: *)")
    .option("--github-secret <secret>", "Webhook secret override")
    .option("--github-app-id <id>", "GitHub App id")
    .option(
      "--github-app-private-key-ssm-parameter <name>",
      "SSM SecureString parameter name for GitHub App private key",
    )
    .option("--skip-github-webhook", "Skip GitHub webhook upsert")
    .option("--strict-workers", "Fail when no workers are found")
    .option("--dry-run-template", "Print template and parameters only")
    .action(handleBootstrapAction);
}

/**
 * Execute bootstrap command action.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
async function handleBootstrapAction(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: BootstrapOptions,
): Promise<void> {
  const context = await buildBootstrapContext(serviceArg, envArg, options);
  const templateBody = buildTemplate();
  if (options.dryRunTemplate) {
    printDryRun(templateBody, context);
    return;
  }
  await runWithProfile(options.profile, async () => {
    await executeBootstrap(templateBody, context);
  });
}

/**
 * Build normalized bootstrap context.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
async function buildBootstrapContext(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: BootstrapOptions,
): Promise<BootstrapContext> {
  const rootDir = options.dir ?? process.cwd();
  const defaults = resolveDeployDefaults(rootDir);
  const service = serviceArg ?? defaults.service;
  const env = envArg ?? defaults.env;
  const region = options.region ?? defaults.region;
  const workers = await loadWorkers(rootDir);
  if ((options.strictWorkers ?? false) && workers.length === 0) {
    throw new Error("no workers found in .skipper/worker/*.ts");
  }
  const encodedWorkers = encodeWorkerManifest({ workers });
  const workerIds = workers.map((worker) => worker.metadata.id);
  const workerEvents = collectGithubEventsFromWorkers(workers);
  const skipGithubWebhook = options.skipGithubWebhook ?? false;
  const githubRepo = skipGithubWebhook
    ? undefined
    : await resolveGithubRepo(options.githubRepo, process.env, rootDir);
  const githubEvents = resolveGithubEvents(
    parseOptionalGithubEvents(options.githubEvents),
    workerEvents,
  );
  const webhookSecret = options.githubSecret ?? createWebhookSecret(service, env);
  const githubAppId = requireValue(options.githubAppId?.trim(), "github app id");
  const githubAppPrivateKeySsmParameterName = requireValue(
    options.githubAppPrivateKeySsmParameter?.trim(),
    "github app private key ssm parameter",
  );
  validateInput(service, env);
  assertWebhookRepo(skipGithubWebhook, githubRepo);
  return {
    rootDir,
    service,
    env,
    region,
    stackName: options.stackName ?? `${service}-${env}-bootstrap`,
    apiName: options.apiName ?? `${service}-${env}-events-api`,
    stageName: options.stageName ?? env,
    githubRepo,
    githubEvents,
    webhookSecret,
    githubAppId,
    githubAppPrivateKeySsmParameterName,
    workerCount: encodedWorkers.workerCount,
    workerIds,
    workerManifestByteLength: encodedWorkers.byteLength,
    workerParameterValues: encodedWorkers.parameterValues,
    timeoutMinutes: options.timeoutMinutes,
    tags: parseTags(options.tags),
    skipGithubWebhook,
    eventBusName: options.eventBusName ?? `${service}-${env}`,
    eventSource: options.eventSource ?? `${service}.webhook`,
    eventDetailType: options.eventDetailType ?? "WebhookReceived",
  };
}

/**
 * Print dry-run deployment payload.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function printDryRun(templateBody: string, context: BootstrapContext): void {
  console.log(
    JSON.stringify(
      {
        stackName: context.stackName,
        region: context.region,
        eventBridge: {
          eventBusName: context.eventBusName,
          eventSource: context.eventSource,
          eventDetailType: context.eventDetailType,
        },
        githubWebhook: context.skipGithubWebhook
          ? { enabled: false }
          : {
              enabled: true,
              repo: context.githubRepo,
              events: context.githubEvents,
              secretConfigured: Boolean(context.webhookSecret),
            },
        githubApp: {
          id: context.githubAppId,
          privateKeySsmParameter: context.githubAppPrivateKeySsmParameterName,
        },
        workers: {
          rootDir: context.rootDir,
          workerCount: context.workerCount,
          workerIds: context.workerIds,
          serializedJsonBytes: context.workerManifestByteLength,
          workerParameterKeys: Object.keys(context.workerParameterValues).sort(),
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
 * @category AWS.Bootstrap
 */
async function runWithProfile(
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
    if (!profile) return;
    if (previousProfile === undefined) {
      delete process.env.AWS_PROFILE;
      return;
    }
    process.env.AWS_PROFILE = previousProfile;
  }
}

/**
 * Execute bootstrap flow.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
async function executeBootstrap(templateBody: string, context: BootstrapContext): Promise<void> {
  try {
    const ec2 = new EC2Client({ region: context.region });
    const network = await discoverDefaultNetwork(ec2);
    const client = new CloudFormationClient({ region: context.region });
    const result = await deployStack({
      client,
      stackName: context.stackName,
      templateBody,
      parameters: createTemplateParameters(context, network),
      timeoutMinutes: context.timeoutMinutes,
      tags: context.tags,
    });
    printDeployOutputs(context.stackName, result.action, result.outputs);
    await upsertWebhookIfEnabled(context, result.outputs);
  } catch (error) {
    await handleBootstrapError(error, context.stackName, context.region);
  }
}

/**
 * Build CloudFormation parameters map.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
export function createTemplateParameters(
  context: BootstrapContext,
  network: BootstrapNetwork,
): Record<string, string> {
  return {
    ServiceName: context.service,
    Environment: context.env,
    ApiName: context.apiName,
    StageName: context.stageName,
    VpcId: network.vpcId,
    SubnetIds: network.subnetIds.join(","),
    EventBusName: context.eventBusName,
    EventSource: context.eventSource,
    EventDetailType: context.eventDetailType,
    WebhookSecret: context.webhookSecret,
    GitHubAppId: context.githubAppId,
    GitHubAppPrivateKeySsmParameterName: context.githubAppPrivateKeySsmParameterName,
    ...context.workerParameterValues,
  };
}

/**
 * Print stack output values.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
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
 * @category AWS.Bootstrap
 */
async function upsertWebhookIfEnabled(
  context: BootstrapContext,
  outputs: Output[],
): Promise<void> {
  if (context.skipGithubWebhook) return;
  const repo = requireValue(context.githubRepo, "github repo");
  const apiInvokeUrl = getRequiredOutput(outputs, "ApiInvokeUrl");
  const githubAppPrivateKeyPem = await readRequiredSecureParameter(
    context.region,
    context.githubAppPrivateKeySsmParameterName,
  );
  const hook = await upsertGithubWebhook({
    repo,
    webhookUrl: apiInvokeUrl,
    events: context.githubEvents,
    secret: context.webhookSecret,
    githubAppId: context.githubAppId,
    githubAppPrivateKeyPem,
  });
  console.log(`GitHub webhook ${hook.action}: ${repo} -> ${apiInvokeUrl}`);
  console.log("GitHub webhook secret rotated");
}

/**
 * Read decrypted secure string from SSM.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
async function readRequiredSecureParameter(region: string, name: string): Promise<string> {
  const client = new SSMClient({ region });
  const response = await client.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    }),
  );
  const value = response.Parameter?.Value?.trim();
  if (!value) {
    throw new Error(`ssm parameter empty: ${name}`);
  }
  return value;
}

/**
 * Handle bootstrap failure output.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
async function handleBootstrapError(
  error: unknown,
  stackName: string,
  region: string,
): Promise<never> {
  console.error(`Bootstrap failed: ${error instanceof Error ? error.message : error}`);
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
 * @category AWS.Bootstrap
 */
function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("timeout must be positive integer");
  }
  return parsed;
}

/**
 * Validate bootstrap service/env names.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
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
 * Ensure webhook repo exists when enabled.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function assertWebhookRepo(skipGithubWebhook: boolean, githubRepo: string | undefined): void {
  if (!skipGithubWebhook && !githubRepo) {
    throw new Error("github repo not found from current repo; pass --github-repo");
  }
}

/**
 * Get required stack output value.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
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
 * Create random webhook secret.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function createWebhookSecret(service: string, env: string): string {
  return `${service}-${env}-${randomBytes(24).toString("hex")}`;
}

/**
 * Parse webhook events CSV as optional list.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function parseOptionalGithubEvents(value?: string): string[] {
  if (!value || value.trim().length === 0) return [];
  const events = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (events.length === 0) return [];
  for (const event of events) {
    if (!/^[a-z0-9_*.-]+$/i.test(event)) {
      throw new Error(`invalid github event: ${event}`);
    }
  }
  return events;
}

/**
 * Resolve final webhook events from explicit and worker-derived values.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
export function resolveGithubEvents(explicit: string[], workerEvents: string[]): string[] {
  const merged = new Set<string>();
  for (const event of explicit) {
    merged.add(event);
  }
  for (const event of workerEvents) {
    merged.add(event);
  }
  if (merged.size === 0) {
    return ["*"];
  }
  return [...merged].sort((left, right) => left.localeCompare(right));
}

/**
 * Require optional value.
 *
 * @since 1.0.0
 * @category AWS.Bootstrap
 */
function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`missing ${label}`);
  }
  return value;
}
