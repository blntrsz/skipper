import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { Webhooks } from "@octokit/webhooks";
import type { GitHubPayload, QueueEnvelope } from "./types";

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

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records ?? []) {
    const envelope = parseEnvelope(record.body);
    const headers = normalizeHeaders(envelope.headers);
    const signature = headers["x-hub-signature-256"];
    const githubEvent = headers["x-github-event"];
    const deliveryId = headers["x-github-delivery"];

    if (!signature || !githubEvent || !deliveryId) {
      throw new Error("missing GitHub webhook headers");
    }

    const rawBody = decodeBase64(envelope.rawBodyB64 ?? "");
    const verified = await webhooks.verify(rawBody, signature);
    if (!verified) throw new Error("invalid webhook signature");

    const payload = JSON.parse(rawBody) as GitHubPayload;
    const repo = payload.repository?.full_name ?? "unknown";
    const action = payload.action ?? "none";

    await ecs.send(
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
          containerOverrides: [
            {
              name: containerName,
              environment: [
                { name: "GITHUB_EVENT", value: githubEvent },
                { name: "GITHUB_DELIVERY", value: deliveryId },
                { name: "GITHUB_REPO", value: repo },
                { name: "GITHUB_ACTION", value: action },
              ],
            },
          ],
        },
      }),
    );
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function parseEnvelope(body: string): QueueEnvelope {
  const parsed = JSON.parse(body) as QueueEnvelope;
  return parsed;
}

function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function normalizeHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    result[key.toLowerCase()] = value;
  }
  return result;
}
