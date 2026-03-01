import { createSign } from "node:crypto";

const JWT_LIFETIME_SECONDS = 9 * 60;

export type BuildGitHubAppJwtInput = {
  appId: string;
  privateKeyPem: string;
  now?: Date;
};

/**
 * Build GitHub App JWT signed with RS256.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
export function buildGitHubAppJwt(input: BuildGitHubAppJwtInput): string {
  const appId = input.appId.trim();
  const privateKeyPem = input.privateKeyPem.trim();
  if (!/^[0-9]+$/.test(appId)) {
    throw new Error("github app id must be numeric");
  }
  if (privateKeyPem.length === 0) {
    throw new Error("github app private key is empty");
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
    iss: appId,
  };
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Encode object as base64url JSON.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), "utf8"));
}

/**
 * Encode bytes as base64url.
 *
 * @since 1.0.0
 * @category AWS.GitHubApp
 */
function base64UrlEncode(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
