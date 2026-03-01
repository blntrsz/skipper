import type { InlineReviewFinding } from "./inline-contract.js";

export type PullRequestFile = {
  filename: string;
  patch?: string;
};

export type MappedInlineFinding = InlineReviewFinding;

export type UnmappedInlineFinding = {
  finding: InlineReviewFinding;
  reason: string;
};

/**
 * Decode `gh api --paginate --slurp` PR files output.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function decodePullRequestFiles(raw: string): PullRequestFile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("pull files response must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("pull files response must be array");
  }
  const pages = parsed.every((entry) => Array.isArray(entry))
    ? (parsed as unknown[][])
    : [parsed as unknown[]];
  const files: PullRequestFile[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (!isRecord(item)) continue;
      const filename = item.filename;
      if (typeof filename !== "string" || filename.trim().length === 0) continue;
      files.push({
        filename,
        patch: typeof item.patch === "string" ? item.patch : undefined,
      });
    }
  }
  return files;
}

/**
 * Build path+line match index for PR right-side diff lines.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function buildChangedLineIndex(files: PullRequestFile[]): Map<string, Set<number>> {
  const lineIndex = new Map<string, Set<number>>();
  for (const file of files) {
    const lines = collectRightSideLines(file.patch);
    if (lines.size === 0) continue;
    lineIndex.set(file.filename, lines);
  }
  return lineIndex;
}

/**
 * Map findings to exact changed right-side lines.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function mapFindingsToChangedLines(
  findings: InlineReviewFinding[],
  lineIndex: Map<string, Set<number>>,
): {
  mapped: MappedInlineFinding[];
  unmapped: UnmappedInlineFinding[];
} {
  const mapped: MappedInlineFinding[] = [];
  const unmapped: UnmappedInlineFinding[] = [];
  for (const finding of findings) {
    const changedLines = lineIndex.get(finding.path);
    if (!changedLines) {
      unmapped.push({ finding, reason: "file not changed in pull request diff" });
      continue;
    }
    if (!changedLines.has(finding.line)) {
      unmapped.push({ finding, reason: "line not changed on right side of diff" });
      continue;
    }
    mapped.push(finding);
  }
  return { mapped, unmapped };
}

/**
 * Parse unified diff patch and collect right-side line numbers.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function collectRightSideLines(patch: string | undefined): Set<number> {
  if (!patch) {
    return new Set<number>();
  }
  const lines = patch.split("\n");
  const changed = new Set<number>();
  let rightLine = 0;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      const rightStart = parseHunkRightStart(line);
      if (rightStart === undefined) {
        inHunk = false;
        continue;
      }
      rightLine = rightStart;
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    const marker = line[0];
    if (marker === "+") {
      changed.add(rightLine);
      rightLine += 1;
      continue;
    }
    if (marker === " ") {
      rightLine += 1;
      continue;
    }
    if (marker === "-") {
      continue;
    }
    if (marker === "\\") {
      continue;
    }
    rightLine += 1;
  }
  return changed;
}

/**
 * Parse right-side hunk start number from unified diff header.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function parseHunkRightStart(hunkHeader: string): number | undefined {
  const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(hunkHeader);
  if (!match) {
    return undefined;
  }
  const rightStart = match[1];
  if (!rightStart) {
    return undefined;
  }
  const value = Number.parseInt(rightStart, 10);
  if (!Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
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
