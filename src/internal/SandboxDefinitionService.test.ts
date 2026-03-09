import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { BunServices } from "@effect/platform-bun";
import { listDockerSandboxDefinitions } from "./SandboxDefinitionService";

describe("SandboxDefinitionService", () => {
  test("merges user and repo sandboxes with repo override", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-sandbox-def-"));
    const userRoot = join(root, "user");
    const repoRoot = join(root, "repo");
    const repository = "demo";

    process.env.SKIPPER_SANDBOX_ROOT = userRoot;
    process.env.SKIPPER_REPOSITORY_ROOT = repoRoot;

    try {
      await mkdir(join(userRoot, "base"), { recursive: true });
      await writeFile(join(userRoot, "base", "Dockerfile"), "FROM busybox\n");
      await writeFile(
        join(userRoot, "base", "sandbox.json"),
        `${JSON.stringify({ containerPath: "/user" })}\n`
      );

      await mkdir(join(repoRoot, repository, ".skipper/sandbox/base"), {
        recursive: true,
      });
      await writeFile(
        join(repoRoot, repository, ".skipper/sandbox/base", "Dockerfile"),
        "FROM alpine\n"
      );
      await writeFile(
        join(repoRoot, repository, ".skipper/sandbox/base", "sandbox.json"),
        `${JSON.stringify({ containerPath: "/repo" })}\n`
      );

      await mkdir(join(userRoot, "extra"), { recursive: true });
      await writeFile(join(userRoot, "extra", "Dockerfile"), "FROM node:20\n");

      const definitions = await Effect.runPromise(
        listDockerSandboxDefinitions(repository).pipe(
          Effect.provide(BunServices.layer)
        )
      );

      expect(definitions.map((item) => item.name)).toEqual(["base", "extra"]);
      expect(definitions.find((item) => item.name === "base")).toMatchObject({
        source: "repo",
        containerPath: "/repo",
      });
      expect(definitions.find((item) => item.name === "extra")).toMatchObject({
        source: "user",
        containerPath: "/workspace",
      });
    } finally {
      delete process.env.SKIPPER_SANDBOX_ROOT;
      delete process.env.SKIPPER_REPOSITORY_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails when sandbox misses Dockerfile", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-sandbox-def-"));
    const userRoot = join(root, "user");
    const repository = "demo";

    process.env.SKIPPER_SANDBOX_ROOT = userRoot;
    process.env.SKIPPER_REPOSITORY_ROOT = join(root, "repo");

    try {
      await mkdir(join(userRoot, "broken"), { recursive: true });

      await expect(
        Effect.runPromise(
          listDockerSandboxDefinitions(repository).pipe(
            Effect.provide(BunServices.layer)
          )
        )
      ).rejects.toThrow("missing 'Dockerfile'");
    } finally {
      delete process.env.SKIPPER_SANDBOX_ROOT;
      delete process.env.SKIPPER_REPOSITORY_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
