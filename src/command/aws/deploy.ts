import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Command } from "commander";
import { parseUnknownJson } from "../../shared/validation/parse-json.js";
import {
  collectGithubEventSubscriptions,
  collectGithubEventsFromWorkers,
  type WorkerGithubEventSubscription,
} from "../../worker/github-events.js";
import { loadWorkers } from "../../worker/load.js";
import { encodeWorkerManifest } from "../../worker/serialize.js";
import { deployStack, getFailureSummary } from "./cloudformation.js";
import { parseTags, resolveDeployDefaults } from "./defaults.js";
import { buildDeployTemplate } from "./deploy-template.js";
import { resolveGithubRepo, toRepositoryPrefix } from "./github.js";

type DeployOptions = {
  region?: string;
  profile?: string;
  dir?: string;
  stackName?: string;
  bootstrapStackName?: string;
  timeoutMinutes: number;
  dryRunTemplate?: boolean;
  tags?: string;
  githubRepo?: string;
  strictWorkers?: boolean;
  eventBusName?: string;
  eventSource?: string;
  eventDetailType?: string;
};

type DeployContext = {
  rootDir: string;
  service: string;
  env: string;
  region: string;
  stackName: string;
  bootstrapStackName: string;
  repositoryFullName: string;
  repositoryPrefix: string;
  workerCount: number;
  workerIds: string[];
  workerSubscriptions: WorkerGithubEventSubscription[];
  workerManifestByteLength: number;
  workerParameterValues: Record<string, string>;
  workerEvents: string[];
  timeoutMinutes: number;
  tags?: Record<string, string>;
  eventBusName: string;
  eventSource: string;
  eventDetailType: string;
  ecsClusterArn: string;
  ecsTaskDefinitionArn: string;
  ecsTaskExecutionRoleArn: string;
  ecsTaskRoleArn: string;
  ecsSecurityGroupId: string;
  ecsSubnetIdsCsv: string;
  webhookSecretParameterName: string;
  lambdaArtifactsBucketName: string;
  githubToken?: string;
};

type LambdaArtifact = {
  bucket: string;
  key: string;
  sha256: string;
};

const EVENTBRIDGE_LAMBDA_ENTRY = fileURLToPath(
  new URL("./lambda/eventbridge-handler.ts", import.meta.url),
);

/**
 * Register aws deploy command.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
export function registerAwsDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description("Deploy repository-scoped AWS subscription stack")
    .argument("[service]", "Service name (default: current directory)")
    .argument("[env]", "Environment (default: AWS_PROFILE or sandbox)")
    .option(
      "--region <region>",
      "AWS region (default: AWS_REGION/AWS_DEFAULT_REGION/us-east-1)",
    )
    .option("--profile <profile>", "AWS profile")
    .option("--dir <path>", "Repository root directory (default: cwd)")
    .option("--stack-name <name>", "CloudFormation stack name")
    .option("--bootstrap-stack-name <name>", "Bootstrap stack name for shared ingress outputs")
    .option("--event-bus-name <name>", "EventBridge bus name override")
    .option("--event-source <source>", "EventBridge source override")
    .option("--event-detail-type <type>", "EventBridge detail-type override")
    .option("--timeout-minutes <n>", "Wait timeout minutes", parseNumber, 30)
    .option("--tags <k=v,...>", "Stack tags")
    .option(
      "--github-repo <owner/repo>",
      "GitHub repo scope for subscription (default: current git repo)",
    )
    .option("--strict-workers", "Fail when no workers are found")
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
  const templateBody = buildDeployTemplate({
    workerSubscriptions: context.workerSubscriptions,
  });
  if (options.dryRunTemplate) {
    printDryRun(templateBody, context);
    return;
  }
  await runWithProfile(options.profile, async () => {
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
  const rootDir = options.dir ?? process.cwd();
  const defaults = resolveDeployDefaults(rootDir);
  const service = serviceArg ?? defaults.service;
  const env = envArg ?? defaults.env;
  const region = options.region ?? defaults.region;
  const workers = await loadWorkers(rootDir);
  if ((options.strictWorkers ?? false) && workers.length === 0) {
    throw new Error("no workers found in .skipper/worker/*.ts");
  }
  const workerSubscriptions = collectGithubEventSubscriptions(workers);
  const encodedWorkers = encodeWorkerManifest({ workers });
  const repositoryFullName = await resolveGithubRepo(options.githubRepo, process.env, rootDir);
  if (!repositoryFullName) {
    throw new Error("github repo not found from current repo; pass --github-repo");
  }
  const repositoryPrefix = toRepositoryPrefix(repositoryFullName);
  const githubToken = await resolveOptionalGithubToken(rootDir);
  const stackName =
    options.stackName ?? buildRepoScopedStackName(repositoryPrefix, service, env);
  const bootstrapStackName =
    options.bootstrapStackName ?? `${service}-${env}-bootstrap`;
  const shared = await resolveSharedDeployConfig({
    region,
    bootstrapStackName,
    eventBusName: options.eventBusName,
    eventSource: options.eventSource,
    eventDetailType: options.eventDetailType,
    service,
  });
  return {
    rootDir,
    service,
    env,
    region,
    stackName,
    bootstrapStackName,
    repositoryFullName,
    repositoryPrefix,
    workerCount: encodedWorkers.workerCount,
    workerIds: workers.map((worker) => worker.metadata.id),
    workerSubscriptions,
    workerManifestByteLength: encodedWorkers.byteLength,
    workerParameterValues: encodedWorkers.parameterValues,
    workerEvents: collectGithubEventsFromWorkers(workers),
    timeoutMinutes: options.timeoutMinutes,
    tags: parseTags(options.tags),
    eventBusName: shared.eventBusName,
    eventSource: shared.eventSource,
    eventDetailType: shared.eventDetailType,
    ecsClusterArn: shared.ecsClusterArn,
    ecsTaskDefinitionArn: shared.ecsTaskDefinitionArn,
    ecsTaskExecutionRoleArn: shared.ecsTaskExecutionRoleArn,
    ecsTaskRoleArn: shared.ecsTaskRoleArn,
    ecsSecurityGroupId: shared.ecsSecurityGroupId,
    ecsSubnetIdsCsv: shared.ecsSubnetIdsCsv,
    webhookSecretParameterName: shared.webhookSecretParameterName,
    lambdaArtifactsBucketName: shared.lambdaArtifactsBucketName,
    githubToken,
  };
}

type SharedDeployConfigInput = {
  region: string;
  bootstrapStackName: string;
  eventBusName?: string;
  eventSource?: string;
  eventDetailType?: string;
  service: string;
};

type SharedDeployConfig = {
  eventBusName: string;
  eventSource: string;
  eventDetailType: string;
  ecsClusterArn: string;
  ecsTaskDefinitionArn: string;
  ecsTaskExecutionRoleArn: string;
  ecsTaskRoleArn: string;
  ecsSecurityGroupId: string;
  ecsSubnetIdsCsv: string;
  webhookSecretParameterName: string;
  lambdaArtifactsBucketName: string;
};

/**
 * Resolve shared event settings from bootstrap stack and overrides.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function resolveSharedDeployConfig(
  input: SharedDeployConfigInput,
): Promise<SharedDeployConfig> {
  const outputs = await readStackOutputs(input.region, input.bootstrapStackName);
  const eventBusName =
    input.eventBusName ?? readOutput(outputs, "EventBusName");
  if (!eventBusName) {
    throw new Error(
      `Missing EventBusName; run aws bootstrap for ${input.bootstrapStackName} or pass --event-bus-name`,
    );
  }
  return {
    eventBusName,
    eventSource:
      input.eventSource ??
      readOutput(outputs, "EventSource") ??
      `${input.service}.webhook`,
    eventDetailType:
      input.eventDetailType ??
      readOutput(outputs, "EventDetailType") ??
      "WebhookReceived",
    ecsClusterArn: readRequiredOutput(outputs, "EcsClusterArn", input.bootstrapStackName),
    ecsTaskDefinitionArn: readRequiredOutput(
      outputs,
      "EcsTaskDefinitionArn",
      input.bootstrapStackName,
    ),
    ecsTaskExecutionRoleArn: readRequiredOutput(
      outputs,
      "EcsTaskExecutionRoleArn",
      input.bootstrapStackName,
    ),
    ecsTaskRoleArn: readRequiredOutput(outputs, "EcsTaskRoleArn", input.bootstrapStackName),
    ecsSecurityGroupId: readRequiredOutput(
      outputs,
      "EcsSecurityGroupId",
      input.bootstrapStackName,
    ),
    ecsSubnetIdsCsv: readRequiredOutput(outputs, "EcsSubnetIdsCsv", input.bootstrapStackName),
    webhookSecretParameterName: readRequiredOutput(
      outputs,
      "WebhookSecretParameterName",
      input.bootstrapStackName,
    ),
    lambdaArtifactsBucketName: readRequiredOutput(
      outputs,
      "LambdaArtifactsBucketName",
      input.bootstrapStackName,
    ),
  };
}

/**
 * Read stack outputs for a stack name.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function readStackOutputs(region: string, stackName: string): Promise<Output[]> {
  const client = new CloudFormationClient({ region });
  try {
    const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
    return response.Stacks?.[0]?.Outputs ?? [];
  } catch {
    throw new Error(
      `bootstrap stack not found: ${stackName}; run aws bootstrap`,
    );
  }
}

/**
 * Read optional output value.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function readOutput(outputs: Output[], key: string): string | undefined {
  return outputs.find((entry) => entry.OutputKey === key)?.OutputValue;
}

/**
 * Read required output value.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function readRequiredOutput(outputs: Output[], key: string, stackName: string): string {
  const value = readOutput(outputs, key);
  if (value) {
    return value;
  }
  throw new Error(
    `Missing ${key} in ${stackName}; re-run aws bootstrap to refresh shared outputs`,
  );
}

/**
 * Build CloudFormation parameters for repo-scoped deploy template.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function createDeployTemplateParameters(
  context: DeployContext,
  artifact: LambdaArtifact,
): Record<string, string> {
  return {
    ServiceName: context.service,
    Environment: context.env,
    RepositoryFullName: context.repositoryFullName,
    RepositoryPrefix: context.repositoryPrefix,
    EventBusName: context.eventBusName,
    EventSource: context.eventSource,
    EventDetailType: context.eventDetailType,
    EcsClusterArn: context.ecsClusterArn,
    EcsTaskDefinitionArn: context.ecsTaskDefinitionArn,
    EcsTaskExecutionRoleArn: context.ecsTaskExecutionRoleArn,
    EcsTaskRoleArn: context.ecsTaskRoleArn,
    EcsSecurityGroupId: context.ecsSecurityGroupId,
    EcsSubnetIdsCsv: context.ecsSubnetIdsCsv,
    WebhookSecretParameterName: context.webhookSecretParameterName,
    GitHubToken: context.githubToken ?? "",
    LambdaCodeS3Bucket: artifact.bucket,
    LambdaCodeS3Key: artifact.key,
    ...context.workerParameterValues,
  };
}

/**
 * Resolve optional GitHub token from env or gh auth.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function resolveOptionalGithubToken(cwd: string): Promise<string | undefined> {
  const tokenFromEnv = process.env.GITHUB_TOKEN?.trim() ?? process.env.GH_TOKEN?.trim() ?? "";
  if (tokenFromEnv.length > 0) {
    return tokenFromEnv;
  }
  const tokenFromGh = await Bun.$`gh auth token`.cwd(cwd).nothrow().text();
  const normalized = tokenFromGh.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

/**
 * Print deploy dry-run payload.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function printDryRun(templateBody: string, context: DeployContext): void {
  console.log(
    JSON.stringify(
      {
        stackName: context.stackName,
        bootstrapStackName: context.bootstrapStackName,
        region: context.region,
        repository: {
          fullName: context.repositoryFullName,
          prefix: context.repositoryPrefix,
        },
        eventBridge: {
          eventBusName: context.eventBusName,
          eventSource: context.eventSource,
          eventDetailType: context.eventDetailType,
        },
        workers: {
          rootDir: context.rootDir,
          workerCount: context.workerCount,
          workerIds: context.workerIds,
          lambdaSubscriptionCount: context.workerSubscriptions.length,
          lambdaSubscriptions: context.workerSubscriptions,
          serializedJsonBytes: context.workerManifestByteLength,
          workerParameterKeys: Object.keys(context.workerParameterValues).sort(),
          events: context.workerEvents,
        },
        ecs: {
          clusterArn: context.ecsClusterArn,
          taskDefinitionArn: context.ecsTaskDefinitionArn,
          taskExecutionRoleArn: context.ecsTaskExecutionRoleArn,
          taskRoleArn: context.ecsTaskRoleArn,
          securityGroupId: context.ecsSecurityGroupId,
          subnetIdsCsv: context.ecsSubnetIdsCsv,
        },
        lambda: {
          webhookSecretParameterName: context.webhookSecretParameterName,
          artifactsBucketName: context.lambdaArtifactsBucketName,
        },
        template: parseUnknownJson(templateBody, "cloudformation template"),
      },
      null,
      2,
    ),
  );
}

/**
 * Build and upload Lambda artifact for deploy stack.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function buildAndUploadLambdaArtifact(context: DeployContext): Promise<LambdaArtifact> {
  const tempDir = await mkdtemp(join(tmpdir(), "skipper-worker-subscription-"));
  const bundleFile = join(tempDir, "index.js");
  const zipFile = join(tempDir, "lambda.zip");
  try {
    await buildLambdaBundle(bundleFile);
    await Bun.$`zip -q -j ${zipFile} ${bundleFile}`;
    const zipBytes = new Uint8Array(await Bun.file(zipFile).arrayBuffer());
    const sha256 = createHash("sha256").update(zipBytes).digest("hex");
    const key = `lambda/worker-subscription/${sha256}.zip`;
    const s3 = new S3Client({ region: context.region });
    await s3.send(
      new PutObjectCommand({
        Bucket: context.lambdaArtifactsBucketName,
        Key: key,
        Body: zipBytes,
        ContentType: "application/zip",
      }),
    );
    return {
      bucket: context.lambdaArtifactsBucketName,
      key,
      sha256,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Build EventBridge Lambda bundle to one file.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function buildLambdaBundle(outfile: string): Promise<void> {
  await Bun.$`bun build ${EVENTBRIDGE_LAMBDA_ENTRY} --target=node --format=cjs --minify --outfile ${outfile}`;
}

/**
 * Execute deploy flow.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function executeDeploy(templateBody: string, context: DeployContext): Promise<void> {
  try {
    const client = new CloudFormationClient({ region: context.region });
    const artifact = await buildAndUploadLambdaArtifact(context);
    const result = await deployStack({
      client,
      stackName: context.stackName,
      templateBody,
      parameters: createDeployTemplateParameters(context, artifact),
      timeoutMinutes: context.timeoutMinutes,
      tags: context.tags,
    });
    console.log(`Stack ${context.stackName} ${result.action === "noop" ? "unchanged" : "deployed"}`);
    for (const output of result.outputs) {
      if (output.OutputKey && output.OutputValue) {
        console.log(`${output.OutputKey}: ${output.OutputValue}`);
      }
    }
  } catch (error) {
    await handleDeployError(error, context.stackName, context.region);
  }
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
 * Run deploy body with optional AWS profile override.
 *
 * @since 1.0.0
 * @category AWS.Deploy
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
 * Build default repo-scoped stack name with limit-safe suffix.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
export function buildRepoScopedStackName(
  repositoryPrefix: string,
  service: string,
  env: string,
): string {
  const base = `${repositoryPrefix}-${service}-${env}-deploy`;
  if (base.length <= 128) {
    return base;
  }
  const hash = createHash("sha1").update(base).digest("hex").slice(0, 8);
  const trimmed = base.slice(0, 119).replace(/-+$/g, "");
  return `${trimmed}-${hash}`;
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
