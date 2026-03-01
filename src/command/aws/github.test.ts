import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  parseGitHubRepoFromRemote,
  resolveGithubRepo,
  toRepositoryPrefix,
  upsertGithubWebhook,
} from "./github.js";

test("parseGitHubRepoFromRemote supports ssh", () => {
  expect(parseGitHubRepoFromRemote("git@github.com:acme/api.git")).toBe(
    "acme/api",
  );
});

test("parseGitHubRepoFromRemote supports https", () => {
  expect(parseGitHubRepoFromRemote("https://github.com/acme/api")).toBe(
    "acme/api",
  );
});

test("resolveGithubRepo prefers explicit", async () => {
  const repo = await resolveGithubRepo("acme/repo", {
    SKIPPER_GITHUB_REPO: "nope/ignored",
  });
  expect(repo).toBe("acme/repo");
});

test("resolveGithubRepo uses env", async () => {
  const repo = await resolveGithubRepo(undefined, {
    SKIPPER_GITHUB_REPO: "acme/from-env",
  }, "/");
  expect(repo).toBe("acme/from-env");
});

test("toRepositoryPrefix normalizes owner/repo", () => {
  expect(toRepositoryPrefix("Acme/My.Repo")).toBe("acme-my-repo");
});

test("toRepositoryPrefix accepts github url", () => {
  expect(toRepositoryPrefix("https://github.com/acme/repo.git")).toBe("acme-repo");
});

test("upsertGithubWebhook creates webhook with app auth", async () => {
  const calls: string[] = [];
  await withMockedFetch(async ({ url, method, headers, body }) => {
    const path = new URL(url).pathname;
    calls.push(`${method} ${path}`);
    if (path === "/repos/acme/repo/installation") {
      expect(headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
      return jsonResponse({ id: 99 });
    }
    if (path === "/app/installations/99/access_tokens") {
      expect(headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
      return jsonResponse({ token: "inst-token", expires_at: "2099-01-01T00:00:00Z" });
    }
    if (path === "/repos/acme/repo/hooks" && method === "GET") {
      expect(headers.get("authorization")).toBe("token inst-token");
      return jsonResponse([]);
    }
    if (path === "/repos/acme/repo/hooks" && method === "POST") {
      const payload = JSON.parse(body) as {
        name: string;
        events: string[];
        config: { secret?: string; url: string };
      };
      expect(payload.name).toBe("web");
      expect(payload.events).toEqual(["issues"]);
      expect(payload.config.secret).toBe("secret");
      expect(payload.config.url).toBe("https://hooks.example.com/events");
      return jsonResponse({ id: 321, config: { url: "https://hooks.example.com/events" } });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const result = await upsertGithubWebhook({
      repo: "acme/repo",
      webhookUrl: "https://hooks.example.com/events",
      events: ["issues"],
      secret: "secret",
      githubAppId: "123",
      githubAppPrivateKeyPem: createPrivateKeyPem(),
    });
    expect(result).toEqual({ action: "created", id: 321 });
  });
  expect(calls).toEqual([
    "GET /repos/acme/repo/installation",
    "POST /app/installations/99/access_tokens",
    "GET /repos/acme/repo/hooks",
    "POST /repos/acme/repo/hooks",
  ]);
});

test("upsertGithubWebhook updates matching webhook", async () => {
  await withMockedFetch(async ({ url, method, body }) => {
    const path = new URL(url).pathname;
    if (path === "/repos/acme/repo/installation") {
      return jsonResponse({ id: 99 });
    }
    if (path === "/app/installations/99/access_tokens") {
      return jsonResponse({ token: "inst-token", expires_at: "2099-01-01T00:00:00Z" });
    }
    if (path === "/repos/acme/repo/hooks" && method === "GET") {
      return jsonResponse([{ id: 55, config: { url: "https://hooks.example.com/events/" } }]);
    }
    if (path === "/repos/acme/repo/hooks/55" && method === "PATCH") {
      const payload = JSON.parse(body) as { events: string[] };
      expect(payload.events).toEqual(["pull_request"]);
      return jsonResponse({ id: 55, config: { url: "https://hooks.example.com/events" } });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const result = await upsertGithubWebhook({
      repo: "acme/repo",
      webhookUrl: "https://hooks.example.com/events",
      events: ["pull_request"],
      githubAppId: "123",
      githubAppPrivateKeyPem: createPrivateKeyPem(),
    });
    expect(result).toEqual({ action: "updated", id: 55 });
  });
});

type FetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

/**
 * Run callback with temporary fetch mock.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
async function withMockedFetch(
  fetchMock: (call: FetchCall) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const requestInfo = input instanceof URL ? input.toString() : input;
    const request = new Request(requestInfo as any, init);
    return fetchMock({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    });
  }) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/**
 * Create JSON response helper.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

/**
 * Generate test private key for app JWT signing.
 *
 * @since 1.0.0
 * @category AWS.GitHub
 */
function createPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs1", format: "pem" }).toString();
}
