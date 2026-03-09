import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { BunServices } from "@effect/platform-bun";
import { listWorkflowDefinitions } from "./WorkflowDefinitionService";

describe("WorkflowDefinitionService", () => {
  test("merges user and repo workflows with repo override", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-workflow-def-"));
    const configRoot = join(root, "config");
    const repoRoot = join(root, "repositories");

    process.env.SKIPPER_CONFIG_ROOT = configRoot;
    process.env.SKIPPER_REPOSITORY_ROOT = repoRoot;

    try {
      await mkdir(join(configRoot, "workflow"), { recursive: true });
      await writeFile(
        join(configRoot, "workflow", "issue-triage.ts"),
        "export default async function workflow() {}\n"
      );
      await writeFile(
        join(configRoot, "workflow", "user-only.ts"),
        "export default async function workflow() {}\n"
      );

      const workspaceRoot = join(repoRoot, "demo");
      await mkdir(join(workspaceRoot, ".git"), { recursive: true });
      await mkdir(join(workspaceRoot, ".skipper", "workflow"), { recursive: true });
      await writeFile(
        join(workspaceRoot, ".skipper", "workflow", "issue-triage.ts"),
        "export default async function workflow() {}\n"
      );
      await writeFile(
        join(workspaceRoot, ".skipper", "workflow", "repo-only.ts"),
        "export default async function workflow() {}\n"
      );

      const definitions = await Effect.runPromise(
        listWorkflowDefinitions({ repository: "demo", branch: "main" }).pipe(
          Effect.provide(BunServices.layer)
        )
      );

      expect(definitions.map((item) => item.name)).toEqual([
        "issue-triage",
        "repo-only",
        "user-only",
      ]);
      expect(definitions.find((item) => item.name === "issue-triage")).toMatchObject({
        source: "repo",
      });
      expect(definitions.find((item) => item.name === "user-only")).toMatchObject({
        source: "user",
      });
    } finally {
      delete process.env.SKIPPER_CONFIG_ROOT;
      delete process.env.SKIPPER_REPOSITORY_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails on duplicate names in one source root", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-workflow-def-"));
    const configRoot = join(root, "config");
    const repoRoot = join(root, "repositories");
    const repository = "demo";

    process.env.SKIPPER_CONFIG_ROOT = configRoot;
    process.env.SKIPPER_REPOSITORY_ROOT = repoRoot;

    try {
      await mkdir(join(repoRoot, repository, ".skipper", "workflow"), {
        recursive: true,
      });
      await writeFile(
        join(repoRoot, repository, ".skipper", "workflow", "dupe.ts"),
        "export default async function workflow() {}\n"
      );
      await mkdir(join(repoRoot, repository, ".skipper", "workflow", "dupe"), {
        recursive: true,
      });
      await writeFile(
        join(
          repoRoot,
          repository,
          ".skipper",
          "workflow",
          "dupe",
          "ignored.ts"
        ),
        "export default async function workflow() {}\n"
      );

      const definitions = await Effect.runPromise(
        listWorkflowDefinitions({ repository: repository, branch: "main" }).pipe(
          Effect.provide(BunServices.layer)
        )
      );

      expect(definitions.map((item) => item.name)).toEqual(["dupe"]);
    } finally {
      delete process.env.SKIPPER_CONFIG_ROOT;
      delete process.env.SKIPPER_REPOSITORY_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns empty when workflow roots are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-workflow-def-"));
    const configRoot = join(root, "config");
    const repoRoot = join(root, "repositories");

    process.env.SKIPPER_CONFIG_ROOT = configRoot;
    process.env.SKIPPER_REPOSITORY_ROOT = repoRoot;

    try {
      await mkdir(join(repoRoot, "demo", ".git"), { recursive: true });

      const definitions = await Effect.runPromise(
        listWorkflowDefinitions({ repository: "demo", branch: "main" }).pipe(
          Effect.provide(BunServices.layer)
        )
      );

      expect(definitions).toEqual([]);
    } finally {
      delete process.env.SKIPPER_CONFIG_ROOT;
      delete process.env.SKIPPER_REPOSITORY_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
