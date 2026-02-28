type WorkerProvider = "github";
type WorkerAgent = "claude" | "opencode";
type WorkerMode = "comment-only" | "apply";

export type WorkerMetadata = {
  id: string;
  type: string;
  description?: string;
  enabled?: boolean;
  version?: string;
};

export type WorkerTriggerFilter = {
  repository?: string[];
  baseBranches?: string[];
  headBranches?: string[];
  draft?: boolean;
};

export type WorkerTrigger = {
  provider: WorkerProvider;
  event: string;
  actions?: string[];
  if?: WorkerTriggerFilter;
};

export type WorkerRuntime = {
  agent?: WorkerAgent;
  mode?: WorkerMode;
  prompt: string;
  allowPush?: boolean;
  maxDurationMinutes?: number;
  env?: Record<string, string>;
};

export type WorkerDefinition = {
  metadata: WorkerMetadata;
  triggers: WorkerTrigger[];
  runtime: WorkerRuntime;
};

export type WorkerManifest = {
  workers: WorkerDefinition[];
};

/**
 * Parse worker module export into typed worker definition.
 *
 * @since 1.0.0
 * @category Shared
 */
export function parseWorkerDefinition(value: unknown, label: string): WorkerDefinition {
  if (!isRecord(value)) {
    throw new Error(`invalid worker definition in ${label}`);
  }
  const metadata = parseMetadata(value.metadata, label);
  const triggers = parseTriggers(value.triggers, label);
  const runtime = parseRuntime(value.runtime, label);
  return {
    metadata: {
      ...metadata,
      enabled: metadata.enabled ?? true,
    },
    triggers,
    runtime,
  };
}

/**
 * Parse worker metadata section.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseMetadata(value: unknown, label: string): WorkerMetadata {
  if (!isRecord(value)) throw new Error(`missing metadata in ${label}`);
  const id = parseWorkerId(value.id, label);
  const type = readNonEmptyString(value.type, `metadata.type in ${label}`);
  const description = readOptionalString(value.description, `metadata.description in ${label}`);
  const enabled = readOptionalBoolean(value.enabled, `metadata.enabled in ${label}`);
  const version = readOptionalString(value.version, `metadata.version in ${label}`);
  return { id, type, description, enabled, version };
}

/**
 * Parse worker trigger list.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseTriggers(value: unknown, label: string): WorkerTrigger[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`missing triggers in ${label}`);
  }
  return value.map((entry, index) => parseTrigger(entry, `${label} triggers[${index}]`));
}

/**
 * Parse one worker trigger.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseTrigger(value: unknown, label: string): WorkerTrigger {
  if (!isRecord(value)) {
    throw new Error(`invalid ${label}`);
  }
  const provider = readNonEmptyString(value.provider, `${label} provider`);
  if (provider !== "github") {
    throw new Error(`invalid provider in ${label}`);
  }
  const event = readNonEmptyString(value.event, `${label} event`);
  const actions = readOptionalStringArray(value.actions, `${label} actions`);
  const filter = parseTriggerFilter(value.if, label);
  return {
    provider,
    event,
    actions,
    if: filter,
  };
}

/**
 * Parse trigger filter block.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseTriggerFilter(value: unknown, label: string): WorkerTriggerFilter | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`invalid if block in ${label}`);
  }
  const repository = readOptionalStringArray(value.repository, `${label} if.repository`);
  const baseBranches = readOptionalStringArray(value.baseBranches, `${label} if.baseBranches`);
  const headBranches = readOptionalStringArray(value.headBranches, `${label} if.headBranches`);
  const draft = readOptionalBoolean(value.draft, `${label} if.draft`);
  return {
    repository,
    baseBranches,
    headBranches,
    draft,
  };
}

/**
 * Parse worker runtime section.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseRuntime(value: unknown, label: string): WorkerRuntime {
  if (!isRecord(value)) throw new Error(`missing runtime in ${label}`);
  const prompt = readNonEmptyString(value.prompt, `runtime.prompt in ${label}`);
  const agentValue = readOptionalString(value.agent, `runtime.agent in ${label}`);
  const modeValue = readOptionalString(value.mode, `runtime.mode in ${label}`);
  const maxDurationMinutes = readOptionalNumber(
    value.maxDurationMinutes,
    `runtime.maxDurationMinutes in ${label}`,
  );
  const env = readOptionalStringRecord(value.env, `runtime.env in ${label}`);
  const allowPush = readOptionalBoolean(value.allowPush, `runtime.allowPush in ${label}`);
  const agent = parseRuntimeAgent(agentValue, label);
  const mode = parseRuntimeMode(modeValue, label);
  return {
    prompt,
    agent,
    mode,
    allowPush,
    maxDurationMinutes,
    env,
  };
}

/**
 * Parse runtime agent value.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseRuntimeAgent(value: string | undefined, label: string): WorkerAgent | undefined {
  if (value === undefined) return undefined;
  if (value !== "claude" && value !== "opencode") {
    throw new Error(`invalid runtime.agent in ${label}`);
  }
  return value;
}

/**
 * Parse runtime mode value.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseRuntimeMode(value: string | undefined, label: string): WorkerMode | undefined {
  if (value === undefined) return undefined;
  if (value !== "comment-only" && value !== "apply") {
    throw new Error(`invalid runtime.mode in ${label}`);
  }
  return value;
}

/**
 * Parse worker id.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseWorkerId(value: unknown, label: string): string {
  const workerId = readNonEmptyString(value, `metadata.id in ${label}`);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(workerId)) {
    throw new Error(`invalid metadata.id in ${label}`);
  }
  return workerId;
}

/**
 * Read optional string value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} must be string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  return normalized;
}

/**
 * Read required non-empty string value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readNonEmptyString(value: unknown, label: string): string {
  const normalized = readOptionalString(value, label);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

/**
 * Read optional number value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

/**
 * Read optional boolean value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean`);
  }
  return value;
}

/**
 * Read optional string array value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be string[]`);
  }
  const result = value.map((entry, index) =>
    readNonEmptyString(entry, `${label}[${index}]`),
  );
  return result;
}

/**
 * Read optional string record value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readOptionalStringRecord(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be object`);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`${label}.${key} must be string`);
    }
    result[key] = entry;
  }
  return result;
}

/**
 * Check plain object shape.
 *
 * @since 1.0.0
 * @category Shared
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
