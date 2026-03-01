import {
  runIssueSubscriptionE2E,
  type VerifyIssueSubscriptionOptions,
} from "../src/command/aws/verify-issue-subscription.js";

const options = buildOptionsFromEnv(process.env);
await runIssueSubscriptionE2E(options);

function buildOptionsFromEnv(
  env: Record<string, string | undefined>,
): VerifyIssueSubscriptionOptions {
  return {
    service: readOptionalText(env.SKIPPER_E2E_SERVICE),
    env: readOptionalText(env.SKIPPER_E2E_ENV),
    region: readOptionalText(env.SKIPPER_E2E_REGION),
    profile: readOptionalText(env.SKIPPER_E2E_AWS_PROFILE),
    dir: readOptionalText(env.SKIPPER_E2E_DIR),
    githubRepo: readOptionalText(env.SKIPPER_E2E_GITHUB_REPO),
    bootstrapStackName: readOptionalText(env.SKIPPER_E2E_BOOTSTRAP_STACK_NAME),
    timeoutMinutes: parseOptionalPositiveInteger(env.SKIPPER_E2E_TIMEOUT_MINUTES),
    pollSeconds: parseOptionalPositiveInteger(env.SKIPPER_E2E_POLL_SECONDS),
    issueTitlePrefix: readOptionalText(env.SKIPPER_E2E_ISSUE_TITLE_PREFIX),
    keepIssue: parseOptionalBoolean(env.SKIPPER_E2E_KEEP_ISSUE),
    keepTask: parseOptionalBoolean(env.SKIPPER_E2E_KEEP_TASK),
  };
}

function readOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  throw new Error(`invalid boolean: ${value}`);
}
