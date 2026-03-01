import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  createInstallationAccessToken,
  type InstallationAccessToken,
} from "../github-app/installations.js";
import { buildGitHubAppJwt } from "../github-app/jwt.js";

const TOKEN_REFRESH_BUFFER_MS = 60_000;

const githubAppId = requiredEnv("GITHUB_APP_ID");
const githubAppPrivateKeySsmParameter = requiredEnv("GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER");

const ssm = new SSMClient({ region: process.env.AWS_REGION });

let cachedPrivateKeyPem: string | undefined;
const installationTokenCache = new Map<number, InstallationAccessToken>();

/**
 * Mint installation token, reusing warm cache when still valid.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export async function mintInstallationToken(installationId: number): Promise<string> {
  if (!Number.isInteger(installationId) || installationId <= 0) {
    throw new Error("installation id must be positive integer");
  }
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return cached.token;
  }
  const privateKeyPem = await readPrivateKeyPem();
  const appJwt = buildGitHubAppJwt({ appId: githubAppId, privateKeyPem });
  const token = await createInstallationAccessToken({ installationId, appJwt });
  installationTokenCache.set(installationId, token);
  return token.token;
}

/**
 * Read required env value.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing env ${name}`);
  }
  return value;
}

/**
 * Read and cache GitHub App private key from SSM.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
async function readPrivateKeyPem(): Promise<string> {
  if (cachedPrivateKeyPem) {
    return cachedPrivateKeyPem;
  }
  const response = await ssm.send(
    new GetParameterCommand({
      Name: githubAppPrivateKeySsmParameter,
      WithDecryption: true,
    }),
  );
  const value = response.Parameter?.Value?.trim();
  if (!value) {
    throw new Error(`ssm parameter empty: ${githubAppPrivateKeySsmParameter}`);
  }
  cachedPrivateKeyPem = value;
  return cachedPrivateKeyPem;
}
