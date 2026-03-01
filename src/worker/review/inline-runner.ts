import {
  buildInlineReviewContractPrompt,
  extractFirstJsonObject,
  parseInlineReviewPayload,
  type InlineReviewFinding,
} from "./inline-contract.js";
import {
  buildChangedLineIndex,
  decodePullRequestFiles,
  mapFindingsToChangedLines,
} from "./diff-map.js";

/**
 * Execute inline review comment workflow.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export async function main(): Promise<void> {
  const context = readContextFromEnv(process.env);
  const prompt = `${context.prompt}\n\n${buildInlineReviewContractPrompt()}`;
  const rawOutput = await runAgent(prompt, context.agent, context.opencodeModel);

  let findings: InlineReviewFinding[];
  try {
    const jsonObject = extractFirstJsonObject(rawOutput);
    const payload = parseInlineReviewPayload(jsonObject);
    findings = dedupeFindings(payload.findings);
  } catch (error) {
    console.warn(`review output parse failed: ${toErrorMessage(error)}`);
    return;
  }

  if (findings.length === 0) {
    console.log("no findings returned");
    return;
  }

  const pullFilesRaw = await Bun.$`gh api --paginate --slurp repos/${context.repo}/pulls/${context.prNumber}/files`.text();
  const pullFiles = decodePullRequestFiles(pullFilesRaw);
  const changedLineIndex = buildChangedLineIndex(pullFiles);
  const { mapped, unmapped } = mapFindingsToChangedLines(findings, changedLineIndex);

  if (unmapped.length > 0) {
    console.log(`skipped ${unmapped.length} unmappable findings`);
  }
  if (mapped.length === 0) {
    console.log("no findings mapped to changed lines");
    return;
  }

  const headSha = await resolveHeadSha(context.repo, context.prNumber, context.prHeadSha);
  for (const finding of mapped) {
    await postInlineComment(context.repo, context.prNumber, headSha, finding);
  }
  console.log(`posted ${mapped.length} inline comments`);
}

type RunnerContext = {
  repo: string;
  prNumber: string;
  prHeadSha?: string;
  prompt: string;
  agent: "claude" | "opencode";
  opencodeModel: string;
};

/**
 * Read required runtime context from env values.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function readContextFromEnv(env: NodeJS.ProcessEnv): RunnerContext {
  return {
    repo: readRequiredEnv(env, "GITHUB_REPO"),
    prNumber: readRequiredEnv(env, "GITHUB_PR_NUMBER"),
    prHeadSha: readOptionalEnv(env, "GITHUB_PR_HEAD_SHA"),
    prompt: readRequiredEnv(env, "PROMPT"),
    agent: env.ECS_AGENT === "opencode" ? "opencode" : "claude",
    opencodeModel: env.OPENCODE_MODEL ?? "amazon-bedrock/eu.anthropic.claude-sonnet-4-6",
  };
}

/**
 * Run the configured agent with review prompt.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export async function runAgent(
  prompt: string,
  agent: RunnerContext["agent"],
  opencodeModel: string,
): Promise<string> {
  if (agent === "opencode") {
    return Bun.$`opencode run -m ${opencodeModel} ${prompt}`.text();
  }
  return Bun.$`claude --dangerously-skip-permissions -p ${prompt}`.text();
}

/**
 * Read current PR head sha, preferring env value.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export async function resolveHeadSha(
  repo: string,
  prNumber: string,
  fromEnv: string | undefined,
): Promise<string> {
  if (fromEnv) {
    return fromEnv;
  }
  const raw = await Bun.$`gh api repos/${repo}/pulls/${prNumber}`.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("pull request payload is not valid JSON");
  }
  if (!isRecord(parsed) || !isRecord(parsed.head) || typeof parsed.head.sha !== "string") {
    throw new Error("pull request payload missing head.sha");
  }
  const sha = parsed.head.sha.trim();
  if (sha.length === 0) {
    throw new Error("pull request head.sha is empty");
  }
  return sha;
}

/**
 * Post one inline comment for one finding.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export async function postInlineComment(
  repo: string,
  prNumber: string,
  headSha: string,
  finding: InlineReviewFinding,
): Promise<void> {
  const commentBody = `[${finding.severity}] ${finding.title}\n\n${finding.body}`;
  await Bun.$`gh api -X POST repos/${repo}/pulls/${prNumber}/comments -f body=${commentBody} -f commit_id=${headSha} -f path=${finding.path} -F line=${finding.line} -f side=RIGHT`.quiet();
}

/**
 * Remove duplicate findings in one run.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
export function dedupeFindings(findings: InlineReviewFinding[]): InlineReviewFinding[] {
  const seen = new Set<string>();
  const deduped: InlineReviewFinding[] = [];
  for (const finding of findings) {
    const fingerprint = `${finding.path}:${finding.line}:${finding.title.toLowerCase()}`;
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    deduped.push(finding);
  }
  return deduped;
}

/**
 * Read required env var.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptionalEnv(env, name);
  if (!value) {
    throw new Error(`missing env ${name}`);
  }
  return value;
}

/**
 * Read optional trimmed env var.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function readOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  if (!value) {
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

/**
 * Render unknown error to concise string.
 *
 * @since 1.0.0
 * @category Worker.Review
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

if (import.meta.main) {
  await main();
}
