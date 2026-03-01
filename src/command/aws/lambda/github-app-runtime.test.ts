import { expect, test } from "bun:test";
import { createGitHubAppRuntime } from "./github-app-runtime.js";

test("createGitHubAppRuntime caches installation token until refresh window", async () => {
  let now = 0;
  let privateKeyReads = 0;
  let tokenMints = 0;
  const runtime = createGitHubAppRuntime(
    {
      appId: "123",
      privateKeySsmParameterName: "/skipper/key",
      tokenRefreshBufferMs: 60_000,
      privateKeyCacheTtlMs: 1_000_000,
    },
    {
      nowMs: () => now,
      readPrivateKeyPem: async () => {
        privateKeyReads += 1;
        return "pem-1";
      },
      buildAppJwt: ({ appId, privateKeyPem }) => `jwt:${appId}:${privateKeyPem}`,
      createInstallationAccessToken: async ({ installationId }) => {
        tokenMints += 1;
        return {
          token: `token-${installationId}-${tokenMints}`,
          expiresAt: new Date(now + 120_000),
        };
      },
    },
  );

  const first = await runtime.mintInstallationToken(10);
  expect(first).toBe("token-10-1");
  expect(privateKeyReads).toBe(1);
  expect(tokenMints).toBe(1);

  now = 30_000;
  const second = await runtime.mintInstallationToken(10);
  expect(second).toBe("token-10-1");
  expect(privateKeyReads).toBe(1);
  expect(tokenMints).toBe(1);

  now = 70_000;
  const third = await runtime.mintInstallationToken(10);
  expect(third).toBe("token-10-2");
  expect(privateKeyReads).toBe(1);
  expect(tokenMints).toBe(2);
});

test("createGitHubAppRuntime refreshes private key after ttl", async () => {
  let now = 0;
  let keyValue = "pem-a";
  let privateKeyReads = 0;
  const runtime = createGitHubAppRuntime(
    {
      appId: "123",
      privateKeySsmParameterName: "/skipper/key",
      tokenRefreshBufferMs: 60_000,
      privateKeyCacheTtlMs: 1_000,
    },
    {
      nowMs: () => now,
      readPrivateKeyPem: async () => {
        privateKeyReads += 1;
        return keyValue;
      },
      buildAppJwt: ({ privateKeyPem }) => `jwt:${privateKeyPem}`,
      createInstallationAccessToken: async ({ appJwt }) => ({
        token: appJwt,
        expiresAt: new Date(now + 1),
      }),
    },
  );

  const first = await runtime.mintInstallationToken(99);
  expect(first).toBe("jwt:pem-a");
  expect(privateKeyReads).toBe(1);

  now = 2_000;
  keyValue = "pem-b";
  const second = await runtime.mintInstallationToken(99);
  expect(second).toBe("jwt:pem-b");
  expect(privateKeyReads).toBe(2);
});

test("createGitHubAppRuntime throws on empty private key", async () => {
  const runtime = createGitHubAppRuntime(
    {
      appId: "123",
      privateKeySsmParameterName: "/skipper/key",
    },
    {
      nowMs: () => 0,
      readPrivateKeyPem: async () => "",
      buildAppJwt: () => "jwt",
      createInstallationAccessToken: async () => ({
        token: "token",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      }),
    },
  );
  await expect(runtime.mintInstallationToken(1)).rejects.toThrow("ssm parameter empty: /skipper/key");
});
