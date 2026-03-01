export type InlineReviewSeverity = "major" | "minor";

export type InlineReviewFinding = {
  severity: InlineReviewSeverity;
  path: string;
  line: number;
  title: string;
  body: string;
};

export type InlineReviewPayload = {
  version: 1;
  findings: InlineReviewFinding[];
};

export const MAX_INLINE_FINDINGS = 25;
export const MAX_INLINE_TITLE_LENGTH = 140;
export const MAX_INLINE_BODY_LENGTH = 600;

/**
 * Parse and validate review payload JSON.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function parseInlineReviewPayload(raw: string): InlineReviewPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("review output must be valid JSON");
  }
  return decodeInlineReviewPayload(parsed);
}

/**
 * Validate review payload shape and normalize values.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function decodeInlineReviewPayload(value: unknown): InlineReviewPayload {
  if (!isRecord(value)) {
    throw new Error("review output must be object");
  }
  if (value.version !== 1) {
    throw new Error("review output version must be 1");
  }
  if (!Array.isArray(value.findings)) {
    throw new Error("review output findings must be array");
  }
  const findings = value.findings
    .map((entry, index) => decodeInlineReviewFinding(entry, index))
    .slice(0, MAX_INLINE_FINDINGS);
  return {
    version: 1,
    findings,
  };
}

/**
 * Build strict prompt suffix for JSON contract.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function buildInlineReviewContractPrompt(): string {
  return [
    "Return strict JSON only with this shape:",
    '{"version":1,"findings":[{"severity":"major|minor","path":"file path","line":123,"title":"short title","body":"actionable explanation"}]}',
    "Rules:",
    "- version must be exactly 1",
    "- findings max 25",
    "- title max 140 chars",
    "- body max 600 chars",
    "- no markdown, no prose outside JSON, no code fences",
  ].join("\n");
}

/**
 * Extract first JSON object from mixed output.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) {
    throw new Error("review output missing JSON object");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }
  throw new Error("review output has unclosed JSON object");
}

/**
 * Parse one review finding.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function decodeInlineReviewFinding(value: unknown, index: number): InlineReviewFinding {
  if (!isRecord(value)) {
    throw new Error(`finding[${index}] must be object`);
  }
  const severity = normalizeSeverity(value.severity, index);
  const path = readNonEmptyString(value.path, `finding[${index}].path`);
  const line = readPositiveInteger(value.line, `finding[${index}].line`);
  const title = clampString(
    readNonEmptyString(value.title, `finding[${index}].title`),
    MAX_INLINE_TITLE_LENGTH,
  );
  const body = clampString(
    readNonEmptyString(value.body, `finding[${index}].body`),
    MAX_INLINE_BODY_LENGTH,
  );
  return {
    severity,
    path,
    line,
    title,
    body,
  };
}

/**
 * Validate finding severity.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function normalizeSeverity(value: unknown, index: number): InlineReviewSeverity {
  if (value !== "major" && value !== "minor") {
    throw new Error(`finding[${index}].severity must be major|minor`);
  }
  return value;
}

/**
 * Read required non-empty string value.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function readNonEmptyString(value: unknown, label: string): string {
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
 * Read required positive integer value.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be positive integer`);
  }
  return value;
}

/**
 * Clamp long strings to max chars.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function clampString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

/**
 * Check plain object shape.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
