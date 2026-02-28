import { basename } from "node:path";

const DEFAULT_ENV = "sandbox";
const DEFAULT_REGION = "us-east-1";

export type DeployDefaults = {
  service: string;
  env: string;
  region: string;
};

/**
 * Resolve default deploy inputs from cwd + env.
 *
 * @since 1.0.0
 * @category AWS.Defaults
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
 * Validate simple slug-like value.
 *
 * @since 1.0.0
 * @category AWS.Defaults
 */
export function isSimpleName(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

/**
 * Parse webhook events CSV.
 *
 * @since 1.0.0
 * @category AWS.Defaults
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
 * @category AWS.Defaults
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
 * Normalize value into simple name.
 *
 * @since 1.0.0
 * @category AWS.Defaults
 */
function toSimpleName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}
