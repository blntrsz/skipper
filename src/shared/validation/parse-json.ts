/**
 * Runtime validator function.
 *
 * @since 1.0.0
 * @category Shared
 */
export type Validator<T> = (value: unknown) => value is T;

/**
 * Parse JSON and validate with type guard.
 *
 * @since 1.0.0
 * @category Shared
 */
export function parseJson<T>(raw: string, validate: Validator<T>, ctx: string): T {
  const parsed = parseUnknownJson(raw, ctx);
  if (!validate(parsed)) {
    throw new Error(`invalid ${ctx}`);
  }
  return parsed;
}

/**
 * Parse unknown JSON safely.
 *
 * @since 1.0.0
 * @category Shared
 */
export function parseUnknownJson(raw: string, ctx: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`invalid JSON for ${ctx}`);
  }
}

/**
 * Check plain object shape.
 *
 * @since 1.0.0
 * @category Shared
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Read string field from object.
 *
 * @since 1.0.0
 * @category Shared
 */
export function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const found = value[key];
  return typeof found === "string" ? found : undefined;
}
