import {
  CloudFormationClient,
  DescribeStackResourceCommand,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  type RunTaskCommandInput,
} from "@aws-sdk/client-ecs";
import type { Command } from "commander";
import { parseGitHubRepoFromRemote } from "./github.js";
import { resolveDeployDefaults } from "./deploy.js";

const DEFAULT_BEDROCK_MODEL = "eu.anthropic.claude-sonnet-4-6";

type AgentType = "claude" | "opencode";

type RunOptions = {
  service?: string;
  env?: string;
  profile?: string;
  stackName?: string;
  githubRepo?: string;
  agent?: string;
  model?: string;
  wait?: boolean;
  timeoutMinutes: number;
  dryRun?: boolean;
};

type RunContext = {
  service: string;
  env: string;
  region: string;
  stackName: string;
  repositoryUrl: string;
  prompt: string;
  agent?: AgentType;
  model?: string;
  wait: boolean;
  timeoutMinutes: number;
};

type StackRunResources = {
  clusterArn: string;
  taskDefinitionArn: string;
  securityGroupId: string;
  subnetIds: string[];
};

/**
 * Register AWS run command.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function registerAwsRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run prompt in ECS task")
    .argument("<prompt...>", "Prompt text for selected agent")
    .option("--service <name>", "Service name (default: current directory)")
    .option("--env <name>", "Environment (default: AWS_PROFILE or sandbox)")
    .option("--profile <profile>", "AWS profile")
    .option("--stack-name <name>", "CloudFormation stack name")
    .option(
      "--github-repo <owner/repo|url>",
      "GitHub repo to clone (default: current git repo)",
    )
    .option("--agent <name>", "ECS agent runtime override (claude|opencode)")
    .option("--model <id>", `Claude Bedrock model id (default: ${DEFAULT_BEDROCK_MODEL})`)
    .option("--wait", "Wait for ECS task to stop")
    .option("--timeout-minutes <n>", "Wait timeout minutes", parseNumber, 30)
    .option("--dry-run", "Print runTask payload only")
    .action(handleRunAction);
}

/**
 * Execute aws run action.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function handleRunAction(
  promptParts: string[],
  options: RunOptions,
): Promise<void> {
  const context = await buildRunContext(promptParts, options);
  await runWithProfile(options.profile, async () => {
    await executeRun(context, options.dryRun ?? false);
  });
}

/**
 * Build normalized run context.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function buildRunContext(
  promptParts: string[],
  options: RunOptions,
): Promise<RunContext> {
  const defaults = resolveDeployDefaults();
  const service = options.service ?? defaults.service;
  const env = options.env ?? defaults.env;
  const region = defaults.region;
  const prompt = promptParts.join(" ").trim();
  if (!isSimpleName(service)) throw new Error("service must match [a-zA-Z0-9-]+");
  if (!isSimpleName(env)) throw new Error("env must match [a-zA-Z0-9-]+");
  if (!prompt) throw new Error("prompt required");
  const repo = options.githubRepo ?? (await resolveRunGithubRepo());
  if (!repo) {
    throw new Error("github repo not found from git remotes/env; pass --github-repo");
  }
  const agent =
    options.agent || process.env.SKIPPER_AWS_AGENT
      ? parseAgentType(options.agent ?? process.env.SKIPPER_AWS_AGENT ?? "")
      : undefined;
  return {
    service,
    env,
    region,
    stackName: options.stackName ?? `${service}-${env}`,
    repositoryUrl: toGitHubCloneUrl(repo),
    prompt,
    agent,
    model: options.model?.trim() || DEFAULT_BEDROCK_MODEL,
    wait: options.wait ?? false,
    timeoutMinutes: options.timeoutMinutes,
  };
}

/**
 * Execute run flow.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function executeRun(context: RunContext, dryRun: boolean): Promise<void> {
  console.log(`Resolving stack ${context.stackName} in ${context.region}...`);
  const cf = new CloudFormationClient({ region: context.region });
  const resources = await resolveRunResources(cf, context.stackName);
  const input = buildRunTaskInput(context, resources);
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          stackName: context.stackName,
          region: context.region,
          request: input,
        },
        null,
        2,
      ),
    );
    return;
  }
  const ecs = new ECSClient({ region: context.region });
  console.log("Starting ECS task...");
  const response = await ecs.send(new RunTaskCommand(input));
  if ((response.failures?.length ?? 0) > 0) {
    const details = response.failures
      ?.map((failure) => `${failure.reason ?? "unknown"}:${failure.detail ?? ""}`)
      .join(", ");
    throw new Error(`ecs runTask failed ${details}`);
  }
  const taskArn = response.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("ecs runTask created no tasks");
  console.log(`Started ECS task: ${taskArn}`);
  if (!context.wait) {
    console.log("Task launched (use --wait to poll until STOPPED)");
    return;
  }
  await waitForTaskStop(ecs, resources.clusterArn, taskArn, context.timeoutMinutes);
}

/**
 * Resolve required stack outputs for run command.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function resolveRunResources(
  client: CloudFormationClient,
  stackName: string,
): Promise<StackRunResources> {
  const res = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack) throw new Error(`stack not found: ${stackName}`);
  const outputs = stack.Outputs ?? [];
  const parameters = stack.Parameters ?? [];
  const securityGroupId =
    readOptionalOutput(outputs, "EcsSecurityGroupId") ??
    (await readSecurityGroupFromResource(client, stackName));
  const subnetIdsCsv =
    readOptionalOutput(outputs, "EcsSubnetIdsCsv") ??
    readRequiredParameter(parameters, "SubnetIds");
  return {
    clusterArn: readRequiredOutput(outputs, "EcsClusterArn"),
    taskDefinitionArn: readRequiredOutput(outputs, "EcsTaskDefinitionArn"),
    securityGroupId,
    subnetIds: parseSubnetIdsCsv(subnetIdsCsv),
  };
}

/**
 * Build ECS runTask command input.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function buildRunTaskInput(
  context: RunContext,
  resources: StackRunResources,
): RunTaskCommandInput {
  const environment = [
    { name: "REPOSITORY_URL", value: context.repositoryUrl },
    { name: "PROMPT", value: context.prompt },
    { name: "CLAUDE_CODE_USE_BEDROCK", value: "1" },
    { name: "AWS_REGION", value: context.region },
    { name: "AWS_DEFAULT_REGION", value: context.region },
    { name: "ANTHROPIC_MODEL", value: context.model ?? DEFAULT_BEDROCK_MODEL },
    {
      name: "ANTHROPIC_DEFAULT_SONNET_MODEL",
      value: context.model ?? DEFAULT_BEDROCK_MODEL,
    },
  ];
  if (context.agent) {
    environment.push({ name: "ECS_AGENT", value: context.agent });
  }
  return {
    cluster: resources.clusterArn,
    taskDefinition: resources.taskDefinitionArn,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: resources.subnetIds,
        securityGroups: [resources.securityGroupId],
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [{ name: "webhook", environment }],
    },
  };
}

/**
 * Convert owner/repo or URL to Git clone URL.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function toGitHubCloneUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("ssh://") || trimmed.startsWith("git@")) {
    const withoutGitSuffix = trimmed.replace(/\.git$/i, "");
    if (withoutGitSuffix.startsWith("git@")) {
      const match = withoutGitSuffix.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
      if (!match) throw new Error(`invalid github repo: ${value}`);
      return `https://github.com/${match[1]}/${match[2]}.git`;
    }
    const match = withoutGitSuffix.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i,
    );
    if (!match) throw new Error(`invalid github repo: ${value}`);
    return `https://github.com/${match[1]}/${match[2]}.git`;
  }
  const normalized = trimmed.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`invalid github repo: ${value}`);
  }
  return `https://github.com/${normalized}.git`;
}

/**
 * Read required CloudFormation output by key.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function readRequiredOutput(outputs: Output[], key: string): string {
  const output = readOptionalOutput(outputs, key);
  if (!output) {
    throw new Error(`Missing CloudFormation output: ${key}`);
  }
  return output;
}

/**
 * Read optional CloudFormation output by key.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
function readOptionalOutput(outputs: Output[], key: string): string | undefined {
  return outputs.find((entry) => entry.OutputKey === key)?.OutputValue;
}

/**
 * Parse subnet CSV from stack output.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function parseSubnetIdsCsv(value: string): string[] {
  const subnetIds = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (subnetIds.length === 0) {
    throw new Error("subnets output empty");
  }
  return subnetIds;
}

/**
 * Poll ECS task until STOPPED.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function waitForTaskStop(
  client: ECSClient,
  clusterArn: string,
  taskArn: string,
  timeoutMinutes: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const res = await client.send(
      new DescribeTasksCommand({
        cluster: clusterArn,
        tasks: [taskArn],
      }),
    );
    const task = res.tasks?.[0];
    const status = task?.lastStatus ?? "UNKNOWN";
    if (status === "STOPPED") {
      const container = task?.containers?.[0];
      const outcome = describeTaskStopOutcome(
        taskArn,
        container?.exitCode,
        task?.stoppedReason,
        container?.reason,
      );
      if (outcome.success) {
        console.log(outcome.message);
        return;
      }
      throw new Error(outcome.message);
    }
    await Bun.sleep(5000);
  }
  throw new Error(`Timed out waiting for task ${taskArn}`);
}

/**
 * Derive task stop outcome from ECS status details.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
export function describeTaskStopOutcome(
  taskArn: string,
  exitCode: number | undefined,
  stoppedReason: string | undefined,
  containerReason: string | undefined,
): { success: boolean; message: string } {
  if (exitCode === 0) {
    return {
      success: true,
      message: `Task success (${taskArn}) exitCode=0`,
    };
  }
  const reasonDetails = [
    stoppedReason ? `stoppedReason=${stoppedReason}` : undefined,
    containerReason ? `containerReason=${containerReason}` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const suffix = reasonDetails.length > 0 ? ` ${reasonDetails.join(" ")}` : "";
  return {
    success: false,
    message: `Task failed (${taskArn}) exitCode=${exitCode ?? "unknown"}${suffix}`,
  };
}

/**
 * Parse positive number option.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("timeout must be positive integer");
  }
  return parsed;
}

/**
 * Validate simple slug-like value.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
function isSimpleName(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

/**
 * Parse ECS agent type.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
function parseAgentType(value: string): AgentType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "claude" || normalized === "opencode") {
    return normalized;
  }
  throw new Error("agent must be claude or opencode");
}

/**
 * Read required CloudFormation stack parameter.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
function readRequiredParameter(
  parameters: Array<{ ParameterKey?: string; ParameterValue?: string }>,
  key: string,
): string {
  const value = parameters.find((entry) => entry.ParameterKey === key)?.ParameterValue;
  if (!value) {
    throw new Error(`Missing CloudFormation parameter: ${key}`);
  }
  return value;
}

/**
 * Read task security group id from stack resource.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function readSecurityGroupFromResource(
  client: CloudFormationClient,
  stackName: string,
): Promise<string> {
  const res = await client.send(
    new DescribeStackResourceCommand({
      StackName: stackName,
      LogicalResourceId: "WebhookTaskSecurityGroup",
    }),
  );
  const id = res.StackResourceDetail?.PhysicalResourceId;
  if (!id) {
    throw new Error("Missing CloudFormation output: EcsSecurityGroupId");
  }
  return id;
}

/**
 * Resolve GitHub repo without gh interactive fallback.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function resolveRunGithubRepo(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  const fromGit = await resolveFromGitRemotes(cwd);
  if (fromGit) return fromGit;
  const fromEnv = env.GITHUB_REPOSITORY ?? env.SKIPPER_GITHUB_REPO;
  return fromEnv?.trim() || undefined;
}

/**
 * Resolve owner/repo from local git remotes.
 *
 * @since 1.0.0
 * @category AWS.Run
 */
async function resolveFromGitRemotes(cwd: string): Promise<string | undefined> {
  const remotesRaw = await Bun.$`git remote`.cwd(cwd).nothrow().text();
  const remotes = remotesRaw
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const orderedRemotes = [
    ...remotes.filter((name) => name === "origin"),
    ...remotes.filter((name) => name !== "origin"),
  ];
  for (const remote of orderedRemotes) {
    const url = await Bun.$`git remote get-url ${remote}`.cwd(cwd).nothrow().text();
    const parsed = parseGitHubRepoFromRemote(url.trim());
    if (parsed) return parsed;
  }
  return undefined;
}

/**
 * Run body with optional AWS profile override.
 *
 * @since 1.0.0
 * @category AWS.Run
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
