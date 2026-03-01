type EventBridgeEvent = {
  detail?: unknown;
};

type SQSEvent = {
  Records?: Array<{
    body: string;
  }>;
};

/**
 * Handle EventBridge event by adapting to queue shape.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export async function handler(event: EventBridgeEvent): Promise<void> {
  const { handler: queueHandler } = await import("./handler.js");
  await queueHandler(toSqsEvent(event));
}

/**
 * Convert EventBridge detail to SQS event payload.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function toSqsEvent(event: EventBridgeEvent): SQSEvent {
  return {
    Records: [
      {
        body: JSON.stringify(readQueueEnvelope(event.detail)),
      },
    ],
  };
}

/**
 * Read queue envelope fields from EventBridge detail.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function readQueueEnvelope(detail: unknown): {
  rawBodyB64?: string;
  headers?: Record<string, string | undefined>;
} {
  if (!isRecord(detail)) {
    return {};
  }
  const rawBodyB64 = typeof detail.rawBodyB64 === "string" ? detail.rawBodyB64 : undefined;
  const headers = isHeaderMap(detail.headers) ? detail.headers : undefined;
  return {
    rawBodyB64,
    headers,
  };
}

/**
 * Check plain object value.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Check header map string values.
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
