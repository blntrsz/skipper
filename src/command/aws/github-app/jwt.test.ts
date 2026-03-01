import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { buildGitHubAppJwt } from "./jwt.js";

test("buildGitHubAppJwt returns signed jwt", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const token = buildGitHubAppJwt({
    appId: "12345",
    privateKeyPem: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    now: new Date("2026-01-01T00:00:00Z"),
  });
  const segments = token.split(".");
  expect(segments).toHaveLength(3);
  const payloadSegment = segments[1];
  expect(payloadSegment).toBeDefined();

  const payload = JSON.parse(Buffer.from(payloadSegment ?? "", "base64url").toString("utf8")) as {
    iss: string;
    iat: number;
    exp: number;
  };
  expect(payload.iss).toBe("12345");
  expect(payload.exp).toBeGreaterThan(payload.iat);
});

test("buildGitHubAppJwt validates app id", () => {
  expect(() => buildGitHubAppJwt({ appId: "app", privateKeyPem: "pem" })).toThrow(
    "github app id must be numeric",
  );
});
