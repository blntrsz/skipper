import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  StopTaskCommand,
  type KeyValuePair,
  type Task,
} from "@aws-sdk/client-ecs";
import {
  isRecord,
  parseJson,
  readOptionalString,
} from "../../shared/validation/parse-json.js";
import { isSimpleName, resolveDeployDefaults } from "./defaults.js";
import { buildRepoScopedStackName } from "./deploy.js";
import { resolveGithubRepo, toRepositoryPrefix } from "./github.js";

export type VerifyIssueSubscriptionOptions = {
  service?: string;
  env?: string;
  region?: string;
  profile?: string;
  dir?: string;
  githubRepo?: string;
  bootstrapStackName?: string;
  timeoutMinutes?: number;
  pollSeconds?: number;
  issueTitlePrefix?: string;
  keepIssue?: boolean;
  keepTask?: boolean;
};

type VerifyIssueSubscriptionContext = {
  rootDir: string;
  service: string;
  env: string;
  region: string;
  repositoryFullName: string;
  bootstrapStackName: string;
  bootstrapStackNameExplicit: boolean;
  deployStackName: string;
  timeoutMs: number;
  pollMs: number;
  issueTitlePrefix: string;
  keepIssue: boolean;
  keepTask: boolean;
};

type BootstrapResources = {
  clusterArn: string;
  logGroupName: string;
};

type CreatedIssue = {
  number: string;
  url: string;
};

type MatchedIssueTask = {
  taskArn: string;
  logStreamName: string;
};

type IssueLogAnalysis = {
  matched: boolean;
  marker?: string;
  error?: string;
};

type GhCreatedIssueResponse = {
  number: number;
  html_url: string;
};

/**
 * Run e2e issue-subscription verification.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
export async function runIssueSubscriptionE2E(
  options: VerifyIssueSubscriptionOptions = {},
): Promise<void> {
  console.log("Running issue subscription e2e verification...");
  const context = await buildVerifyIssueSubscriptionContext(options);
  console.log(
    `Config repo=${context.repositoryFullName} region=${context.region} bootstrap=${context.bootstrapStackName}`,
  );
  await runWithProfile(options.profile, async () => {
    await executeVerifyIssueSubscription(context);
  });
  console.log("Verification completed");
}

/**
 * Build normalized e2e verification context.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function buildVerifyIssueSubscriptionContext(
  options: VerifyIssueSubscriptionOptions,
): Promise<VerifyIssueSubscriptionContext> {
  const rootDir = options.dir ?? process.cwd();
  const defaults = resolveDeployDefaults(rootDir);
  const service = options.service ?? defaults.service;
  const env = options.env ?? defaults.env;
  const region = options.region ?? defaults.region;
  const timeoutMinutes = options.timeoutMinutes ?? 12;
  const pollSeconds = options.pollSeconds ?? 5;
  assertPositiveInteger(timeoutMinutes, "timeoutMinutes");
  assertPositiveInteger(pollSeconds, "pollSeconds");
  if (!isSimpleName(service)) {
    throw new Error("service must match [a-zA-Z0-9-]+");
  }
  if (!isSimpleName(env)) {
    throw new Error("env must match [a-zA-Z0-9-]+");
  }
  const repositoryFullName = await resolveGithubRepo(options.githubRepo, process.env, rootDir);
  if (!repositoryFullName) {
    throw new Error("github repo not found from current repo; pass --github-repo");
  }
  const repositoryPrefix = toRepositoryPrefix(repositoryFullName);
  const bootstrapStackName = options.bootstrapStackName ?? `${service}-${env}-bootstrap`;
  const deployStackName = buildRepoScopedStackName(repositoryPrefix, service, env);
  const issueTitlePrefix = options.issueTitlePrefix?.trim() ?? "[e2e] issue subscription verify";
  if (issueTitlePrefix.length === 0) {
    throw new Error("issue title prefix required");
  }
  return {
    rootDir,
    service,
    env,
    region,
    repositoryFullName,
    bootstrapStackName,
    bootstrapStackNameExplicit: options.bootstrapStackName !== undefined,
    deployStackName,
    timeoutMs: timeoutMinutes * 60_000,
    pollMs: pollSeconds * 1000,
    issueTitlePrefix,
    keepIssue: options.keepIssue ?? false,
    keepTask: options.keepTask ?? false,
  };
}

/**
 * Run full e2e verification flow.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function executeVerifyIssueSubscription(
  context: VerifyIssueSubscriptionContext,
): Promise<void> {
  console.log("Resolving bootstrap resources...");
  const cloudformation = new CloudFormationClient({ region: context.region });
  const ecs = new ECSClient({ region: context.region });
  const logs = new CloudWatchLogsClient({ region: context.region });
  const resources = await resolveBootstrapResources(cloudformation, context);
  console.log(`Bootstrap resources resolved: cluster=${resources.clusterArn}`);
  const baselineTaskArns = await listKnownTaskArns(ecs, resources.clusterArn);
  console.log(`Baseline tasks tracked: ${baselineTaskArns.size}`);
  const issue = await createVerificationIssue(context);
  console.log(`Created verification issue: ${issue.url}`);
  console.log(`Using deploy stack scope: ${context.deployStackName}`);

  let matchedTask: MatchedIssueTask | undefined;
  let verificationError: unknown;
  try {
    matchedTask = await waitForMatchingIssueTask({
      ecs,
      clusterArn: resources.clusterArn,
      baselineTaskArns,
      issueNumber: issue.number,
      timeoutMs: context.timeoutMs,
      pollMs: context.pollMs,
    });
    console.log(`Matched ECS task: ${matchedTask.taskArn}`);
    const logMarker = await waitForIssueFetchEvidence({
      logs,
      logGroupName: resources.logGroupName,
      logStreamName: matchedTask.logStreamName,
      repositoryFullName: context.repositoryFullName,
      issueNumber: issue.number,
      timeoutMs: context.timeoutMs,
      pollMs: context.pollMs,
    });
    console.log(`Issue fetch evidence: ${logMarker}`);
    console.log("E2E issue subscription verification passed");
  } catch (error) {
    verificationError = error;
  }

  await cleanupVerificationArtifacts(context, issue, matchedTask, resources.clusterArn, ecs);
  if (verificationError !== undefined) {
    throw verificationError;
  }
}

/**
 * Resolve bootstrap resources needed by e2e flow.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function resolveBootstrapResources(
  client: CloudFormationClient,
  context: VerifyIssueSubscriptionContext,
): Promise<BootstrapResources> {
  const { outputs, stackName } = await resolveBootstrapStackOutputs(client, context);
  if (stackName !== context.bootstrapStackName) {
    console.log(`Bootstrap stack fallback used: ${stackName}`);
  }
  return {
    clusterArn: readRequiredOutput(outputs, "EcsClusterArn", stackName),
    logGroupName: buildTaskLogGroupName(context.service, context.env),
  };
}

/**
 * Resolve bootstrap stack outputs with optional name fallback.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function resolveBootstrapStackOutputs(
  client: CloudFormationClient,
  context: VerifyIssueSubscriptionContext,
): Promise<{ outputs: Output[]; stackName: string }> {
  const primaryOutputs = await tryReadStackOutputs(client, context.bootstrapStackName);
  if (primaryOutputs) {
    return {
      outputs: primaryOutputs,
      stackName: context.bootstrapStackName,
    };
  }
  if (context.bootstrapStackNameExplicit) {
    throw new Error(`bootstrap stack not found: ${context.bootstrapStackName}; run aws bootstrap`);
  }
  const fallbackStackName = `${context.service}-${context.env}`;
  const fallbackOutputs = await tryReadStackOutputs(client, fallbackStackName);
  if (fallbackOutputs) {
    return {
      outputs: fallbackOutputs,
      stackName: fallbackStackName,
    };
  }
  throw new Error(
    `bootstrap stack not found: ${context.bootstrapStackName} or ${fallbackStackName}; run aws bootstrap`,
  );
}

/**
 * Read stack outputs or return undefined when stack is missing.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function tryReadStackOutputs(
  client: CloudFormationClient,
  stackName: string,
): Promise<Output[] | undefined> {
  try {
    const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
    return response.Stacks?.[0]?.Outputs ?? [];
  } catch {
    return undefined;
  }
}

/**
 * Read required stack output value.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function readRequiredOutput(outputs: Output[], key: string, stackName: string): string {
  const value = outputs.find((entry) => entry.OutputKey === key)?.OutputValue;
  if (value) return value;
  throw new Error(`Missing ${key} in ${stackName}; re-run aws bootstrap`);
}

/**
 * Create temporary GitHub issue used for verification.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function createVerificationIssue(
  context: VerifyIssueSubscriptionContext,
): Promise<CreatedIssue> {
  const runId = Date.now().toString();
  const title = `${context.issueTitlePrefix} ${runId}`;
  const body =
    "Automated e2e verification for issue webhook -> ECS task trigger and issue fetch.";
  const raw = await runGhApi(
    [
      "--method",
      "POST",
      `repos/${context.repositoryFullName}/issues`,
      "-f",
      `title=${title}`,
      "-f",
      `body=${body}`,
    ],
    context.rootDir,
  );
  const parsed = parseCreatedIssue(raw);
  return {
    number: String(parsed.number),
    url: parsed.html_url,
  };
}

/**
 * Close temporary verification issue.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function closeVerificationIssue(
  context: VerifyIssueSubscriptionContext,
  issue: CreatedIssue,
): Promise<void> {
  await runGhApi(
    [
      "--method",
      "PATCH",
      `repos/${context.repositoryFullName}/issues/${issue.number}`,
      "-f",
      "state=closed",
    ],
    context.rootDir,
  );
}

/**
 * Execute `gh api` and return stdout.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function runGhApi(args: string[], cwd: string): Promise<string> {
  const process = Bun.spawn(["gh", "api", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `gh api failed (${exitCode})`);
  }
  return stdout;
}

/**
 * Parse GitHub issue creation response.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function parseCreatedIssue(raw: string): GhCreatedIssueResponse {
  return parseJson(raw, isCreatedIssueResponse, "created issue response");
}

/**
 * Validate GitHub issue creation payload.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function isCreatedIssueResponse(value: unknown): value is GhCreatedIssueResponse {
  if (!isRecord(value)) return false;
  if (typeof value.number !== "number") return false;
  return typeof readOptionalString(value, "html_url") === "string";
}

/**
 * Wait for task matching created issue payload.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function waitForMatchingIssueTask(input: {
  ecs: ECSClient;
  clusterArn: string;
  baselineTaskArns: Set<string>;
  issueNumber: string;
  timeoutMs: number;
  pollMs: number;
}): Promise<MatchedIssueTask> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const knownTaskArns = await listKnownTaskArns(input.ecs, input.clusterArn);
    const candidateTaskArns = [...knownTaskArns].filter(
      (taskArn) => !input.baselineTaskArns.has(taskArn),
    );
    if (candidateTaskArns.length > 0) {
      const tasks = await describeTasks(input.ecs, input.clusterArn, candidateTaskArns);
      const matched = findMatchingTask(tasks, input.issueNumber);
      if (matched) return matched;
    }
    await Bun.sleep(input.pollMs);
  }
  throw new Error(`timed out waiting for issue task issue=${input.issueNumber}`);
}

/**
 * List currently known ECS task arns (running + stopped).
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function listKnownTaskArns(client: ECSClient, clusterArn: string): Promise<Set<string>> {
  const running = await listAllTaskArns(client, clusterArn, "RUNNING");
  const stopped = await listAllTaskArns(client, clusterArn, "STOPPED");
  return new Set([...running, ...stopped]);
}

/**
 * List all task arns for one ECS desired status.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function listAllTaskArns(
  client: ECSClient,
  clusterArn: string,
  desiredStatus: "RUNNING" | "STOPPED",
): Promise<string[]> {
  const taskArns: string[] = [];
  let nextToken: string | undefined;
  do {
    const response = await client.send(
      new ListTasksCommand({
        cluster: clusterArn,
        desiredStatus,
        nextToken,
        maxResults: 100,
      }),
    );
    taskArns.push(...(response.taskArns ?? []));
    nextToken = response.nextToken;
  } while (nextToken);
  return taskArns;
}

/**
 * Describe ECS tasks by arns, chunked by API limit.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function describeTasks(
  client: ECSClient,
  clusterArn: string,
  taskArns: string[],
): Promise<Task[]> {
  const tasks: Task[] = [];
  for (let index = 0; index < taskArns.length; index += 100) {
    const chunk = taskArns.slice(index, index + 100);
    const response = await client.send(
      new DescribeTasksCommand({
        cluster: clusterArn,
        tasks: chunk,
      }),
    );
    tasks.push(...(response.tasks ?? []));
  }
  return tasks;
}

/**
 * Find issue-opened task from described task set.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function findMatchingTask(tasks: Task[], issueNumber: string): MatchedIssueTask | undefined {
  for (const task of tasks) {
    const taskArn = task.taskArn;
    if (!taskArn) continue;
    const environment = readTaskEnvironmentEntries(task);
    if (!isIssueTaskEnvironment(environment, issueNumber)) continue;
    return {
      taskArn,
      logStreamName: buildTaskLogStreamName(taskArn),
    };
  }
  return undefined;
}

/**
 * Read merged environment entries from task overrides.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function readTaskEnvironmentEntries(task: Task): KeyValuePair[] {
  const entries: KeyValuePair[] = [];
  for (const override of task.overrides?.containerOverrides ?? []) {
    entries.push(...(override.environment ?? []));
  }
  return entries;
}

/**
 * Check whether task env matches issue opened payload.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
export function isIssueTaskEnvironment(
  environment: KeyValuePair[],
  issueNumber: string,
): boolean {
  const values: Record<string, string> = {};
  for (const entry of environment) {
    if (!entry.name || entry.value === undefined) continue;
    values[entry.name] = entry.value;
  }
  return (
    values.GITHUB_EVENT === "issues" &&
    values.GITHUB_ACTION === "opened" &&
    values.GITHUB_ISSUE_NUMBER === issueNumber
  );
}

/**
 * Build ECS webhook log group name.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function buildTaskLogGroupName(service: string, env: string): string {
  return `/aws/ecs/${service}-${env}-webhook`;
}

/**
 * Build ECS log stream name from task arn.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function buildTaskLogStreamName(taskArn: string): string {
  const taskId = extractTaskId(taskArn);
  return `ecs/webhook/${taskId}`;
}

/**
 * Extract task id from ECS task arn.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function extractTaskId(taskArn: string): string {
  const taskId = taskArn.split("/").at(-1)?.trim();
  if (!taskId) {
    throw new Error(`invalid task arn: ${taskArn}`);
  }
  return taskId;
}

/**
 * Wait for issue fetch evidence in task logs.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function waitForIssueFetchEvidence(input: {
  logs: CloudWatchLogsClient;
  logGroupName: string;
  logStreamName: string;
  repositoryFullName: string;
  issueNumber: string;
  timeoutMs: number;
  pollMs: number;
}): Promise<string> {
  const deadline = Date.now() + input.timeoutMs;
  let nextToken: string | undefined;
  while (Date.now() < deadline) {
    let events: Array<{ message?: string }> = [];
    try {
      const response = await input.logs.send(
        new GetLogEventsCommand({
          logGroupName: input.logGroupName,
          logStreamName: input.logStreamName,
          nextToken,
          startFromHead: nextToken === undefined,
        }),
      );
      events = response.events ?? [];
      nextToken = response.nextForwardToken ?? nextToken;
    } catch (error) {
      if (isMissingLogStreamError(error)) {
        await Bun.sleep(input.pollMs);
        continue;
      }
      throw error;
    }
    const messages = events
      .map((event) => event.message)
      .filter((message): message is string => typeof message === "string");
    const analysis = analyzeIssueTaskLogs(
      messages,
      input.repositoryFullName,
      input.issueNumber,
    );
    if (analysis.error) {
      throw new Error(analysis.error);
    }
    if (analysis.matched) {
      return analysis.marker ?? "issue fetch marker detected";
    }
    await Bun.sleep(input.pollMs);
  }
  throw new Error(
    `timed out waiting for issue fetch logs issue=${input.issueNumber} stream=${input.logStreamName}`,
  );
}

/**
 * Check whether error means missing log stream/group.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function isMissingLogStreamError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const name = readOptionalString(error, "name");
  return name === "ResourceNotFoundException";
}

/**
 * Analyze log lines for issue fetch success and known failures.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
export function analyzeIssueTaskLogs(
  messages: string[],
  repositoryFullName: string,
  issueNumber: string,
): IssueLogAnalysis {
  const ghMarker = `gh issue view ${issueNumber}`;
  const webMarker = `WebFetch https://github.com/${repositoryFullName}/issues/${issueNumber}`;
  const apiMarker =
    `WebFetch https://api.github.com/repos/${repositoryFullName}/issues/${issueNumber}`;
  for (const rawMessage of messages) {
    const message = stripAnsi(rawMessage);
    if (message.includes("command not found")) {
      return {
        matched: false,
        error: `task runtime command failure: ${message.trim()}`,
      };
    }
    if (
      message.includes("gh auth login") ||
      message.includes("GH_TOKEN environment variable")
    ) {
      return {
        matched: false,
        error: `task runtime missing GitHub auth: ${message.trim()}`,
      };
    }
    if (
      message.includes(ghMarker) ||
      message.includes(webMarker) ||
      message.includes(apiMarker)
    ) {
      return {
        matched: true,
        marker: message.trim(),
      };
    }
  }
  return { matched: false };
}

/**
 * Strip ANSI escape sequences from one log line.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Clean up temporary issue/task artifacts.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
async function cleanupVerificationArtifacts(
  context: VerifyIssueSubscriptionContext,
  issue: CreatedIssue,
  matchedTask: MatchedIssueTask | undefined,
  clusterArn: string,
  ecs: ECSClient,
): Promise<void> {
  if (!context.keepTask && matchedTask) {
    try {
      await ecs.send(
        new StopTaskCommand({
          cluster: clusterArn,
          task: matchedTask.taskArn,
          reason: "issue subscription verification complete",
        }),
      );
      console.log(`Stopped verification task: ${matchedTask.taskArn}`);
    } catch (error) {
      console.warn(
        `Failed stopping task ${matchedTask.taskArn}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!context.keepIssue) {
    try {
      await closeVerificationIssue(context, issue);
      console.log(`Closed verification issue: ${issue.url}`);
    } catch (error) {
      console.warn(
        `Failed closing issue ${issue.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Assert positive integer value.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
 */
function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be positive integer`);
  }
}

/**
 * Run body with optional AWS profile override.
 *
 * @since 1.0.0
 * @category AWS.VerifyIssue
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
    if (profile) {
      if (previousProfile === undefined) {
        delete process.env.AWS_PROFILE;
      } else {
        process.env.AWS_PROFILE = previousProfile;
      }
    }
  }
}
