import { isRecord, parseJson } from "../../../shared/validation/parse-json.js";
import { githubApiRequest } from "./api.js";

type RepoInstallationResponse = {
  id: number;
};

type AccessTokenResponse = {
  token: string;
  expires_at: string;
};

export type InstallationAccessToken = {
  token: string;
  expiresAt: Date;
};

export type FetchRepositoryInstallationIdInput = {
  repo: string;
  appJwt: string;
};

export type CreateInstallationAccessTokenInput = {
  installationId: number;
  appJwt: string;
};

/**
 * Resolve GitHub App installation id for repository.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
export async function fetchRepositoryInstallationId(
  input: FetchRepositoryInstallationIdInput,
): Promise<number> {
  const repo = input.repo.trim();
  const response = await githubApiRequest({
    path: `/repos/${repo}/installation`,
    token: input.appJwt,
    tokenType: "bearer",
  });
  const parsed = parseJson(response, isRepoInstallationResponse, "repository installation");
  return parsed.id;
}

/**
 * Mint installation token for one installation id.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
export async function createInstallationAccessToken(
  input: CreateInstallationAccessTokenInput,
): Promise<InstallationAccessToken> {
  const response = await githubApiRequest({
    method: "POST",
    path: `/app/installations/${input.installationId}/access_tokens`,
    token: input.appJwt,
    tokenType: "bearer",
  });
  const parsed = parseJson(response, isAccessTokenResponse, "installation access token");
  const expiresAt = new Date(parsed.expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("invalid installation token expiry");
  }
  return {
    token: parsed.token,
    expiresAt,
  };
}

/**
 * Check repository installation response shape.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
function isRepoInstallationResponse(value: unknown): value is RepoInstallationResponse {
  if (!isRecord(value)) return false;
  return typeof value.id === "number";
}

/**
 * Check installation access token response shape.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  if (!isRecord(value)) return false;
  return typeof value.token === "string" && typeof value.expires_at === "string";
}
