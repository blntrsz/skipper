import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  createInstallationAccessToken,
  type InstallationAccessToken,
} from "../github-app/installations.js";
import { buildGitHubAppJwt } from "../github-app/jwt.js";

const TOKEN_REFRESH_BUFFER_MS = 60_000;
const PRIVATE_KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type GitHubAppRuntimeConfig = {
  appId: string;
  privateKeySsmParameterName: string;
  tokenRefreshBufferMs?: number;
  privateKeyCacheTtlMs?: number;
};

export type GitHubAppRuntimeDeps = {
  nowMs: () => number;
  readPrivateKeyPem: () => Promise<string>;
  buildAppJwt: (input: { appId: string; privateKeyPem: string }) => string;
  createInstallationAccessToken: (input: {
    installationId: number;
    appJwt: string;
  }) => Promise<InstallationAccessToken>;
};

export type GitHubAppRuntime = {
  mintInstallationToken: (installationId: number) => Promise<string>;
};

type CachedPrivateKey = {
  value: string;
  loadedAtMs: number;
};

/**
 * Create token runtime with private key + token caches.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function createGitHubAppRuntime(
  config: GitHubAppRuntimeConfig,
  deps: GitHubAppRuntimeDeps,
): GitHubAppRuntime {
  const tokenRefreshBufferMs = config.tokenRefreshBufferMs ?? TOKEN_REFRESH_BUFFER_MS;
  const privateKeyCacheTtlMs = config.privateKeyCacheTtlMs ?? PRIVATE_KEY_CACHE_TTL_MS;
  const installationTokenCache = new Map<number, InstallationAccessToken>();
  let cachedPrivateKey: CachedPrivateKey | undefined;

  return {
    async mintInstallationToken(installationId: number): Promise<string> {
      if (!Number.isInteger(installationId) || installationId <= 0) {
        throw new Error("installation id must be positive integer");
      }
      const now = deps.nowMs();
      const cachedToken = installationTokenCache.get(installationId);
      if (cachedToken && cachedToken.expiresAt.getTime() - now > tokenRefreshBufferMs) {
        return cachedToken.token;
      }
      const privateKeyPem = await readPrivateKeyPemCached(now);
      const appJwt = deps.buildAppJwt({
        appId: config.appId,
        privateKeyPem,
      });
      const token = await deps.createInstallationAccessToken({
        installationId,
        appJwt,
      });
      installationTokenCache.set(installationId, token);
      return token.token;
    },
  };

  /**
   * Read private key from cache or source.
   *
   * @since 1.0.0
   * @category AWS.Lambda
   */
  async function readPrivateKeyPemCached(nowMs: number): Promise<string> {
    if (cachedPrivateKey && nowMs - cachedPrivateKey.loadedAtMs < privateKeyCacheTtlMs) {
      return cachedPrivateKey.value;
    }
    const value = (await deps.readPrivateKeyPem()).trim();
    if (!value) {
      throw new Error(`ssm parameter empty: ${config.privateKeySsmParameterName}`);
    }
    cachedPrivateKey = {
      value,
      loadedAtMs: nowMs,
    };
    return cachedPrivateKey.value;
  }
}

let defaultRuntime: GitHubAppRuntime | undefined;

/**
 * Mint installation token, reusing warm cache when still valid.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export async function mintInstallationToken(installationId: number): Promise<string> {
  return getDefaultRuntime().mintInstallationToken(installationId);
}

/**
 * Read default runtime from env-backed config.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
function getDefaultRuntime(): GitHubAppRuntime {
  if (defaultRuntime) {
    return defaultRuntime;
  }
  const appId = requiredEnv("GITHUB_APP_ID");
  const privateKeySsmParameterName = requiredEnv("GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER");
  const ssm = new SSMClient({ region: process.env.AWS_REGION });
  defaultRuntime = createGitHubAppRuntime(
    {
      appId,
      privateKeySsmParameterName,
    },
    {
      nowMs: () => Date.now(),
      readPrivateKeyPem: async () => {
        const response = await ssm.send(
          new GetParameterCommand({
            Name: privateKeySsmParameterName,
            WithDecryption: true,
          }),
        );
        return response.Parameter?.Value ?? "";
      },
      buildAppJwt: ({ appId: currentAppId, privateKeyPem }) =>
        buildGitHubAppJwt({
          appId: currentAppId,
          privateKeyPem,
        }),
      createInstallationAccessToken,
    },
  );
  return defaultRuntime;
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
