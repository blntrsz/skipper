export type GitHubApiRequestInput = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  token: string;
  tokenType?: "bearer" | "token";
  body?: unknown;
};

/**
 * Run GitHub REST request and return response body text.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
export async function githubApiRequest(input: GitHubApiRequestInput): Promise<string> {
  const method = input.method ?? "GET";
  const tokenType = input.tokenType ?? "bearer";
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `${tokenType === "bearer" ? "Bearer" : "token"} ${input.token}`,
    "User-Agent": "skipper",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const requestInit: RequestInit = {
    method,
    headers,
  };
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify(input.body);
  }
  const response = await fetch(`https://api.github.com${input.path}`, requestInit);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${input.path} failed (${response.status}): ${truncateErrorBody(text)}`,
    );
  }
  return text;
}

/**
 * Truncate API error text for readable failures.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
function truncateErrorBody(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 500) {
    return normalized;
  }
  return `${normalized.slice(0, 500)}...`;
}
