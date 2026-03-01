export type QueueEnvelope = {
  rawBodyB64?: string;
  headers?: Record<string, string | undefined>;
};

export type GitHubPayload = {
  number?: number;
  prompt?: string;
  inputs?: {
    prompt?: string;
  };
  client_payload?: {
    prompt?: string;
  };
  repository?: {
    full_name?: string;
    clone_url?: string;
  };
  issue?: {
    number?: number;
    html_url?: string;
  };
  pull_request?: {
    number?: number;
    html_url?: string;
    draft?: boolean;
    base?: {
      ref?: string;
      sha?: string;
    };
    head?: {
      ref?: string;
      sha?: string;
    };
  };
  action?: string;
};

/**
 * Check queue envelope shape.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function isQueueEnvelope(value: unknown): value is QueueEnvelope {
  if (!isRecord(value)) return false;
  if (value.rawBodyB64 !== undefined && typeof value.rawBodyB64 !== "string") {
    return false;
  }
  if (value.headers !== undefined && !isHeaderMap(value.headers)) {
    return false;
  }
  return true;
}

/**
 * Check webhook payload shape.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function isGitHubPayload(value: unknown): value is GitHubPayload {
  if (!isRecord(value)) return false;
  return true;
}

/**
 * Check plain record shape.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Check header map values.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function isHeaderMap(value: unknown): value is Record<string, string | undefined> {
  if (!isRecord(value)) return false;
  for (const headerValue of Object.values(value)) {
    if (headerValue !== undefined && typeof headerValue !== "string") {
      return false;
    }
  }
  return true;
}
