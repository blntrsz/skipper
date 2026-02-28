import { basename } from "node:path";
import {
  isRecord,
  parseJson,
  readOptionalString,
} from "../../shared/validation/parse-json.js";

type GithubHook = {
  id?: number;
  config?: {
    url?: string;
  };
};

type GithubHookWithId = GithubHook & { id: number };

export type UpsertGithubWebhookInput = {
  repo: string;
  webhookUrl: string;
  events?: string[];
  secret?: string;
};

export type UpsertGithubWebhookResult = {
  action: "created" | "updated";
  id: number;
};

/**
 * Resolve target GitHub repo name.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
export async function resolveGithubRepo(
  explicitRepo?: string,
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Promise<string | undefined> {
  if (explicitRepo) return normalizeRepo(explicitRepo);

  const fromCurrentRepo = await resolveFromGitRemote(cwd);
  if (fromCurrentRepo) return fromCurrentRepo;

  const fromEnv = env.GITHUB_REPOSITORY ?? env.SKIPPER_GITHUB_REPO;
  if (fromEnv) return normalizeRepo(fromEnv);

  const inferredFromGh = await inferFromGhLoginAndCwd(cwd);
  if (inferredFromGh) return inferredFromGh;

  return undefined;
}

/**
 * Create or update webhook for repository.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
export async function upsertGithubWebhook(
  input: UpsertGithubWebhookInput,
): Promise<UpsertGithubWebhookResult> {
  const repo = normalizeRepo(input.repo);
  const webhookUrl = normalizeUrl(input.webhookUrl);
  const events = input.events && input.events.length > 0 ? input.events : ["*"];

  const hooksJson = await runGhApi([`repos/${repo}/hooks`]);
  const hooks = parseHooks(hooksJson);
  const existing = hooks.find(
    (hook) => normalizeUrl(hook.config?.url) === webhookUrl,
  );

  if (existing?.id !== undefined) {
    const updatedJson = await runGhApi([
      "--method",
      "PATCH",
      `repos/${repo}/hooks/${existing.id}`,
      ...buildWebhookFormArgs({ webhookUrl, events, secret: input.secret }),
    ]);
    const updated = parseHook(updatedJson);
    return {
      action: "updated",
      id: updated.id,
    };
  }

  const createdJson = await runGhApi([
    "--method",
    "POST",
    `repos/${repo}/hooks`,
    "-f",
    "name=web",
    ...buildWebhookFormArgs({ webhookUrl, events, secret: input.secret }),
  ]);
  const created = parseHook(createdJson);
  return {
    action: "created",
    id: created.id,
  };
}

type WebhookFormArgsInput = {
  webhookUrl: string;
  events: string[];
  secret?: string;
};

/**
 * Build `gh api` form args for webhook.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function buildWebhookFormArgs(input: WebhookFormArgsInput): string[] {
  const args = [
    "-F",
    "active=true",
    "-f",
    `config[url]=${input.webhookUrl}`,
    "-f",
    "config[content_type]=json",
    "-f",
    "config[insecure_ssl]=0",
  ];

  for (const event of input.events) {
    args.push("-f", `events[]=${event}`);
  }

  if (input.secret && input.secret.length > 0) {
    args.push("-f", `config[secret]=${input.secret}`);
  }

  return args;
}

/**
 * Execute `gh api` command.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
async function runGhApi(args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(["gh", "api", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (code !== 0) {
      throw new Error(stderr.trim() || `gh api failed (${code})`);
    }
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GitHub API error: ${message}`);
  }
}

/**
 * Parse hooks list response.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function parseHooks(raw: string): GithubHook[] {
  const parsed = parseJson(raw, isHookArray, "GitHub hooks list");
  return parsed;
}

/**
 * Check hooks array shape.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function isHookArray(value: unknown): value is GithubHook[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isGithubHook);
}

/**
 * Parse webhook object response.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function parseHook(raw: string): GithubHookWithId {
  const hook = parseJson(raw, isGithubHook, "GitHub webhook response");
  if (hook.id === undefined) {
    throw new Error("GitHub webhook id missing");
  }
  return {
    ...hook,
    id: hook.id,
  };
}

/**
 * Validate GitHub hook shape.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function isGithubHook(value: unknown): value is GithubHook {
  if (!isRecord(value)) return false;
  if (value.id !== undefined && typeof value.id !== "number") return false;
  const config = value.config;
  if (config === undefined) return true;
  if (!isRecord(config)) return false;
  const url = readOptionalString(config, "url");
  return config.url === undefined || typeof url === "string";
}

/**
 * Normalize repo input to owner/repo.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function normalizeRepo(value: string): string {
  const trimmed = value.trim();
  const fromRemote = parseGitHubRepoFromRemote(trimmed);
  const repo = fromRemote ?? trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
  const clean = repo.replace(/\.git$/i, "");

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) {
    throw new Error(`github repo must be owner/repo: ${value}`);
  }

  return clean;
}

/**
 * Normalize URL for matching.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function normalizeUrl(url?: string): string {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
}

/**
 * Parse owner/repo from GitHub remote URL.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
export function parseGitHubRepoFromRemote(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  const ssh = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  if (ssh?.[1]) return ssh[1];

  const https = trimmed.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i,
  );
  if (https?.[1]) return https[1];

  const sshUrl = trimmed.match(
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i,
  );
  if (sshUrl?.[1]) return sshUrl[1];

  return undefined;
}

/**
 * Resolve repo from local git remotes.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
async function resolveFromGitRemote(cwd: string): Promise<string | undefined> {
  const origin = await getGitRemoteUrl("origin", cwd);
  const parsedOrigin = origin ? parseGitHubRepoFromRemote(origin) : undefined;
  if (parsedOrigin) return normalizeRepo(parsedOrigin);

  const remotesRaw = await Bun.$`git remote`.cwd(cwd).nothrow().text();
  const remotes = remotesRaw
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name !== "origin");

  for (const remote of remotes) {
    const url = await getGitRemoteUrl(remote, cwd);
    if (!url) continue;
    const parsed = parseGitHubRepoFromRemote(url);
    if (parsed) return normalizeRepo(parsed);
  }

  return undefined;
}

/**
 * Get git remote URL value.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
async function getGitRemoteUrl(
  remote: string,
  cwd: string,
): Promise<string | undefined> {
  const url = await Bun.$`git remote get-url ${remote}`.cwd(cwd).nothrow().text();
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Infer repo from `gh` login and cwd.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
async function inferFromGhLoginAndCwd(
  cwd: string,
): Promise<string | undefined> {
  const repoName = basename(cwd).trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(repoName)) return undefined;

  const owner = await Bun.$`gh api user --jq .login`.cwd(cwd).nothrow().text();
  const cleanOwner = owner.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(cleanOwner)) return undefined;

  return normalizeRepo(`${cleanOwner}/${repoName}`);
}
