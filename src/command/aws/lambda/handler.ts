import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { Webhooks } from "@octokit/webhooks";
import { parseJson } from "../../../shared/validation/parse-json.js";
import { WORKERS_SHA256_PARAM } from "../../../worker/aws-params.js";
import { routeWorkers } from "../../../worker/route.js";
import { decodeWorkerManifest } from "../../../worker/serialize.js";
import type { WorkerManifest } from "../../../worker/contract.js";
import {
  type GitHubPayload,
  type QueueEnvelope,
  isGitHubPayload,
  isQueueEnvelope,
} from "./types";

type SQSEvent = {
  Records?: Array<{
    body: string;
  }>;
};

const clusterArn = requiredEnv("ECS_CLUSTER_ARN");
const taskDefinitionArn = requiredEnv("ECS_TASK_DEFINITION_ARN");
const securityGroupId = requiredEnv("ECS_SECURITY_GROUP_ID");
const subnetIds = requiredEnv("ECS_SUBNET_IDS").split(",").map((v) => v.trim()).filter(Boolean);
const webhookSecret = requiredEnv("WEBHOOK_SECRET");
const assignPublicIp = process.env.ECS_ASSIGN_PUBLIC_IP === "DISABLED" ? "DISABLED" : "ENABLED";
const containerName = process.env.ECS_CONTAINER_NAME ?? "webhook";
const workersStackName = process.env.WORKERS_STACK_NAME?.trim() ?? "";
const workersSha256 = process.env.WORKERS_SHA256?.trim() ?? "";
const workerIdFilter = process.env.SKIPPER_WORKER_ID?.trim() ?? "";

const webhooks = new Webhooks({ secret: webhookSecret });
const ecs = new ECSClient({ region: process.env.AWS_REGION });
const cloudformation = new CloudFormationClient({ region: process.env.AWS_REGION });

let cachedWorkers: { sha256: string; manifest: WorkerManifest | undefined } | undefined;

/**
 * Process SQS webhook events and launch ECS tasks.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records ?? []) {
    await handleRecord(record.body);
  }
}

/**
 * Handle one queue record.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
async function handleRecord(body: string): Promise<void> {
  const envelope = parseEnvelope(body);
  const rawBody = decodeBase64(envelope.rawBodyB64 ?? "");
  const payload = parseJson(rawBody, isGitHubPayload, "github payload");
  const headers = normalizeHeaders(envelope.headers);
  const webhookMeta = readWebhookMeta(headers);
  const eventFromPayload = inferEventFromPayload(payload);
  if (!webhookMeta) {
    const missingHeaders = listMissingWebhookHeaders(headers).join(",");
    console.warn(
      `Skipping webhook missing headers=${missingHeaders} event=${eventFromPayload} action=${payload.action ?? "none"} repo=${payload.repository?.full_name ?? "unknown"}`,
    );
    return;
  }
  console.log(
    `Received webhook event=${webhookMeta.githubEvent} action=${payload.action ?? "none"} delivery=${webhookMeta.deliveryId} repo=${payload.repository?.full_name ?? "unknown"}`,
  );
  await verifyWebhookBody(rawBody, webhookMeta.signature);
  const workers = await loadWorkersManifest();
  const environments = buildTaskEnvironments(payload, webhookMeta, workers);
  if (environments.length === 0) {
    console.log(
      `No worker matched event=${webhookMeta.githubEvent} action=${payload.action ?? "none"}`,
    );
    return;
  }
  for (const environment of environments) {
    await runTask(environment);
  }
}

/**
 * Read required env variable.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

/**
 * Parse queue envelope with compatibility fallback.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function parseEnvelope(body: string): QueueEnvelope {
  try {
    return parseJson(body, isQueueEnvelope, "queue envelope");
  } catch {
    const parsed = parseLegacyEnvelope(body);
    if (parsed) return parsed;
    throw new Error("invalid queue envelope");
  }
}

/**
 * Decode base64 payload to utf8.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

/**
 * Normalize header keys to lowercase.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function normalizeHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

/**
 * Build repository clone URL from payload.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function resolveRepositoryUrl(payload: GitHubPayload): string | undefined {
  const cloneUrl = payload.repository?.clone_url?.trim();
  if (cloneUrl) return cloneUrl;

  const fullName = payload.repository?.full_name?.trim();
  if (!fullName) return undefined;
  return `https://github.com/${fullName}.git`;
}

/**
 * Resolve prompt from payload or env.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function resolvePrompt(payload: GitHubPayload): string | undefined {
  const promptFromPayload =
    payload.prompt?.trim() ??
    payload.client_payload?.prompt?.trim() ??
    payload.inputs?.prompt?.trim();
  if (promptFromPayload) return promptFromPayload;

  return process.env.PROMPT?.trim();
}

/**
 * Load and cache worker manifest from stack parameters.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
async function loadWorkersManifest(): Promise<WorkerManifest | undefined> {
  if (!workersStackName || !workersSha256) {
    return undefined;
  }
  if (cachedWorkers?.sha256 === workersSha256) {
    return cachedWorkers.manifest;
  }
  const response = await cloudformation.send(
    new DescribeStacksCommand({ StackName: workersStackName }),
  );
  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`stack not found: ${workersStackName}`);
  }
  const parameterValues = readStackParameterValues(stack.Parameters ?? []);
  const manifest = decodeWorkerManifest(parameterValues);
  const parameterSha = parameterValues[WORKERS_SHA256_PARAM]?.trim() ?? "";
  if (parameterSha !== workersSha256) {
    throw new Error("worker manifest hash mismatch between lambda env and stack params");
  }
  cachedWorkers = { sha256: workersSha256, manifest };
  return manifest;
}

/**
 * Build stack parameter map from list.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readStackParameterValues(
  parameters: Array<{ ParameterKey?: string; ParameterValue?: string }>,
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const parameter of parameters) {
    if (!parameter.ParameterKey) continue;
    values[parameter.ParameterKey] = parameter.ParameterValue;
  }
  return values;
}

/**
 * Parse legacy queue envelope format.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function parseLegacyEnvelope(body: string): QueueEnvelope | undefined {
  const prefix = "{rawBodyB64=";
  const headerMarker = ", headers={";
  if (!body.startsWith(prefix) || !body.endsWith("}}")) return undefined;

  const markerIndex = body.indexOf(headerMarker);
  if (markerIndex === -1) return undefined;

  const rawBodyB64 = body.slice(prefix.length, markerIndex).trim();
  const headerPayload = body.slice(markerIndex + headerMarker.length, body.length - 2);
  const headers = parseLegacyHeaders(headerPayload);

  return {
    rawBodyB64: rawBodyB64.length > 0 ? rawBodyB64 : undefined,
    headers,
  };
}

/**
 * Parse legacy header serialization.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function parseLegacyHeaders(value: string): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const part of value.split(", ")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    headers[key] = part.slice(index + 1).trim();
  }
  return headers;
}

type WebhookMeta = {
  signature: string;
  githubEvent: string;
  deliveryId: string;
};

type IssueContext = {
  number: string;
  url?: string;
};

type PullRequestContext = {
  number: string;
  url?: string;
  headSha?: string;
  baseSha?: string;
};

/**
 * Infer GitHub event type from payload shape.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function inferEventFromPayload(payload: GitHubPayload): string {
  if (payload.pull_request) return "pull_request";
  if (payload.issue) return "issues";
  const record = payload as Record<string, unknown>;
  if (typeof record.zen === "string") return "ping";
  return "unknown";
}

/**
 * Read normalized issue context from webhook payload.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readIssueContext(payload: GitHubPayload): IssueContext | undefined {
  if (!payload.issue) return undefined;
  const issueNumber = payload.issue.number;
  if (typeof issueNumber !== "number" || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return undefined;
  }
  const issueUrl = payload.issue.html_url?.trim();
  return {
    number: String(issueNumber),
    url: issueUrl && issueUrl.length > 0 ? issueUrl : undefined,
  };
}

/**
 * Read normalized pull request context from webhook payload.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readPullRequestContext(payload: GitHubPayload): PullRequestContext | undefined {
  if (!payload.pull_request) return undefined;
  const pullRequestNumber =
    payload.pull_request.number ??
    (typeof (payload as Record<string, unknown>).number === "number"
      ? ((payload as Record<string, unknown>).number as number)
      : undefined);
  if (
    typeof pullRequestNumber !== "number" ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    return undefined;
  }
  const pullRequestUrl = payload.pull_request.html_url?.trim();
  const headSha = payload.pull_request.head?.sha?.trim();
  const baseSha = payload.pull_request.base?.sha?.trim();
  return {
    number: String(pullRequestNumber),
    url: pullRequestUrl && pullRequestUrl.length > 0 ? pullRequestUrl : undefined,
    headSha: headSha && headSha.length > 0 ? headSha : undefined,
    baseSha: baseSha && baseSha.length > 0 ? baseSha : undefined,
  };
}

/**
 * List missing required webhook headers.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function listMissingWebhookHeaders(headers: Record<string, string | undefined>): string[] {
  const required = ["x-hub-signature-256", "x-github-event", "x-github-delivery"];
  return required.filter((name) => !headers[name]);
}

/**
 * Read required webhook headers.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readWebhookMeta(headers: Record<string, string | undefined>): WebhookMeta | undefined {
  if (listMissingWebhookHeaders(headers).length > 0) {
    return undefined;
  }
  const signature = headers["x-hub-signature-256"];
  const githubEvent = headers["x-github-event"];
  const deliveryId = headers["x-github-delivery"];
  if (!signature || !githubEvent || !deliveryId) return undefined;
  return { signature, githubEvent, deliveryId };
}

/**
 * Verify webhook signature.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
async function verifyWebhookBody(rawBody: string, signature: string): Promise<void> {
  const verified = await webhooks.verify(rawBody, signature);
  if (!verified) throw new Error("invalid webhook signature");
}

/**
 * Build ECS env vars for task.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function buildTaskEnvironments(
  payload: GitHubPayload,
  webhookMeta: WebhookMeta,
  manifest: WorkerManifest | undefined,
): Array<Array<{ name: string; value: string }>> {
  const repositoryUrl = resolveRepositoryUrl(payload);
  if (!repositoryUrl) throw new Error("missing repository clone url");
  const baseEnvironment = [
    { name: "GITHUB_EVENT", value: webhookMeta.githubEvent },
    { name: "GITHUB_DELIVERY", value: webhookMeta.deliveryId },
    { name: "GITHUB_REPO", value: payload.repository?.full_name ?? "unknown" },
    { name: "GITHUB_ACTION", value: payload.action ?? "none" },
    { name: "REPOSITORY_URL", value: repositoryUrl },
  ];
  const issueContext = readIssueContext(payload);
  if (issueContext) {
    baseEnvironment.push({ name: "GITHUB_ISSUE_NUMBER", value: issueContext.number });
    pushOptionalEnv(baseEnvironment, "GITHUB_ISSUE_URL", issueContext.url);
  }
  const pullRequestContext = readPullRequestContext(payload);
  if (pullRequestContext) {
    baseEnvironment.push({ name: "GITHUB_PR_NUMBER", value: pullRequestContext.number });
    pushOptionalEnv(baseEnvironment, "GITHUB_PR_URL", pullRequestContext.url);
    pushOptionalEnv(baseEnvironment, "GITHUB_PR_HEAD_SHA", pullRequestContext.headSha);
    pushOptionalEnv(baseEnvironment, "GITHUB_PR_BASE_SHA", pullRequestContext.baseSha);
  }
  if (!manifest) {
    if (workerIdFilter.length > 0) {
      throw new Error("worker-scoped lambda missing workers manifest");
    }
    return [buildLegacyTaskEnvironment(payload, baseEnvironment)];
  }
  const matchedWorkers = filterWorkersById(
    routeWorkers(manifest, {
      provider: "github",
      event: webhookMeta.githubEvent,
      action: payload.action,
      repository: payload.repository?.full_name,
      baseBranch: payload.pull_request?.base?.ref,
      headBranch: payload.pull_request?.head?.ref,
      draft: payload.pull_request?.draft,
    }),
    workerIdFilter,
  );
  return matchedWorkers.map((worker) => buildWorkerTaskEnvironment(baseEnvironment, worker));
}

/**
 * Filter matched workers when lambda is scoped to one worker id.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function filterWorkersById(
  workers: WorkerManifest["workers"],
  workerId: string,
): WorkerManifest["workers"] {
  if (workerId.length === 0) {
    return workers;
  }
  return workers.filter((worker) => worker.metadata.id === workerId);
}

/**
 * Build legacy task environment when no workers configured.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function buildLegacyTaskEnvironment(
  payload: GitHubPayload,
  baseEnvironment: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const prompt = resolvePrompt(payload);
  if (!prompt) throw new Error("missing prompt");
  const environment = [...baseEnvironment, { name: "PROMPT", value: prompt }];
  pushOptionalEnv(environment, "GITHUB_TOKEN", process.env.GITHUB_TOKEN);
  pushOptionalEnv(environment, "ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  return environment;
}

/**
 * Build worker-specific task environment.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function buildWorkerTaskEnvironment(
  baseEnvironment: Array<{ name: string; value: string }>,
  worker: WorkerManifest["workers"][number],
): Array<{ name: string; value: string }> {
  const mode = worker.runtime.mode ?? "apply";
  const allowPush = worker.runtime.allowPush ?? mode !== "comment-only";
  const environment = [
    ...baseEnvironment,
    { name: "PROMPT", value: worker.runtime.prompt },
    { name: "SKIPPER_WORKER_ID", value: worker.metadata.id },
    { name: "SKIPPER_WORKER_TYPE", value: worker.metadata.type },
    { name: "SKIPPER_WORKER_MODE", value: mode },
    { name: "SKIPPER_ALLOW_PUSH", value: allowPush ? "1" : "0" },
  ];
  if (worker.runtime.agent) {
    environment.push({ name: "ECS_AGENT", value: worker.runtime.agent });
  }
  for (const [key, value] of Object.entries(worker.runtime.env ?? {})) {
    environment.push({ name: key, value });
  }
  pushOptionalEnv(environment, "GITHUB_TOKEN", process.env.GITHUB_TOKEN);
  pushOptionalEnv(environment, "ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  return environment;
}

/**
 * Add optional environment variable.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function pushOptionalEnv(
  environment: Array<{ name: string; value: string }>,
  name: string,
  value: string | undefined,
): void {
  if (value) {
    environment.push({ name, value });
  }
}

/**
 * Run ECS task and assert success.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
async function runTask(environment: Array<{ name: string; value: string }>): Promise<void> {
  const response = await ecs.send(
    new RunTaskCommand({
      cluster: clusterArn,
      taskDefinition: taskDefinitionArn,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnetIds,
          securityGroups: [securityGroupId],
          assignPublicIp,
        },
      },
      overrides: {
        containerOverrides: [{ name: containerName, environment }],
      },
    }),
  );
  assertRunTaskSuccess(response.failures, response.tasks?.length ?? 0);
}

/**
 * Assert ECS runTask response.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function assertRunTaskSuccess(
  failures: Array<{ reason?: string; detail?: string }> | undefined,
  taskCount: number,
): void {
  if ((failures?.length ?? 0) > 0) {
    const details = (failures ?? [])
      .map((failure) => `${failure.reason ?? "unknown"}:${failure.detail ?? ""}`)
      .join(", ");
    throw new Error(`ecs runTask failed ${details}`);
  }
  if (taskCount === 0) {
    throw new Error("ecs runTask created no tasks");
  }
}
