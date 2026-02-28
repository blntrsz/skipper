import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { Webhooks } from "@octokit/webhooks";
import { parseJson } from "../../../shared/validation/parse-json.js";
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

const webhooks = new Webhooks({ secret: webhookSecret });
const ecs = new ECSClient({ region: process.env.AWS_REGION });

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
  const headers = normalizeHeaders(envelope.headers);
  const webhookMeta = readWebhookMeta(headers);
  const rawBody = decodeBase64(envelope.rawBodyB64 ?? "");
  await verifyWebhookBody(rawBody, webhookMeta.signature);
  const payload = parseJson(rawBody, isGitHubPayload, "github payload");
  const environment = buildTaskEnvironment(payload, webhookMeta);
  await runTask(environment);
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

/**
 * Read required webhook headers.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readWebhookMeta(headers: Record<string, string | undefined>): WebhookMeta {
  const signature = headers["x-hub-signature-256"];
  const githubEvent = headers["x-github-event"];
  const deliveryId = headers["x-github-delivery"];
  if (!signature || !githubEvent || !deliveryId) {
    throw new Error("missing GitHub webhook headers");
  }
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
function buildTaskEnvironment(
  payload: GitHubPayload,
  webhookMeta: WebhookMeta,
): Array<{ name: string; value: string }> {
  const repositoryUrl = resolveRepositoryUrl(payload);
  const prompt = resolvePrompt(payload);
  if (!repositoryUrl) throw new Error("missing repository clone url");
  if (!prompt) throw new Error("missing prompt");

  const environment = [
    { name: "GITHUB_EVENT", value: webhookMeta.githubEvent },
    { name: "GITHUB_DELIVERY", value: webhookMeta.deliveryId },
    { name: "GITHUB_REPO", value: payload.repository?.full_name ?? "unknown" },
    { name: "GITHUB_ACTION", value: payload.action ?? "none" },
    { name: "REPOSITORY_URL", value: repositoryUrl },
    { name: "PROMPT", value: prompt },
  ];
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
