import { createHash } from "node:crypto";
import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import type { Command } from "commander";
import { parseUnknownJson } from "../../shared/validation/parse-json.js";
import { collectGithubEventsFromWorkers } from "../../worker/github-events.js";
import { loadWorkers } from "../../worker/load.js";
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
  workerEvents: string[];
  timeoutMinutes: number;
  tags?: Record<string, string>;
  eventBusName: string;
  eventSource: string;
  eventDetailType: string;
};

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
  const templateBody = buildDeployTemplate();
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
  const repositoryFullName = await resolveGithubRepo(options.githubRepo, process.env, rootDir);
  if (!repositoryFullName) {
    throw new Error("github repo not found from current repo; pass --github-repo");
  }
  const repositoryPrefix = toRepositoryPrefix(repositoryFullName);
  const stackName =
    options.stackName ?? buildRepoScopedStackName(repositoryPrefix, service, env);
  const bootstrapStackName =
    options.bootstrapStackName ?? `${service}-${env}-bootstrap`;
  const shared = await resolveSharedEventConfig({
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
    workerCount: workers.length,
    workerEvents: collectGithubEventsFromWorkers(workers),
    timeoutMinutes: options.timeoutMinutes,
    tags: parseTags(options.tags),
    eventBusName: shared.eventBusName,
    eventSource: shared.eventSource,
    eventDetailType: shared.eventDetailType,
  };
}

type SharedEventConfigInput = {
  region: string;
  bootstrapStackName: string;
  eventBusName?: string;
  eventSource?: string;
  eventDetailType?: string;
  service: string;
};

type SharedEventConfig = {
  eventBusName: string;
  eventSource: string;
  eventDetailType: string;
};

/**
 * Resolve shared event settings from bootstrap stack and overrides.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
async function resolveSharedEventConfig(
  input: SharedEventConfigInput,
): Promise<SharedEventConfig> {
  const needBootstrapLookup =
    !input.eventBusName || !input.eventSource || !input.eventDetailType;
  let outputs: Output[] = [];
  if (needBootstrapLookup) {
    outputs = await readStackOutputs(input.region, input.bootstrapStackName);
  }
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
      `bootstrap stack not found: ${stackName}; run aws bootstrap or pass --event-bus-name/--event-source/--event-detail-type`,
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
 * Build CloudFormation parameters for repo-scoped deploy template.
 *
 * @since 1.0.0
 * @category AWS.Deploy
 */
function createDeployTemplateParameters(context: DeployContext): Record<string, string> {
  return {
    ServiceName: context.service,
    Environment: context.env,
    RepositoryFullName: context.repositoryFullName,
    RepositoryPrefix: context.repositoryPrefix,
    EventBusName: context.eventBusName,
    EventSource: context.eventSource,
    EventDetailType: context.eventDetailType,
  };
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
          events: context.workerEvents,
        },
        template: parseUnknownJson(templateBody, "cloudformation template"),
      },
      null,
      2,
    ),
  );
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
    const result = await deployStack({
      client,
      stackName: context.stackName,
      templateBody,
      parameters: createDeployTemplateParameters(context),
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
