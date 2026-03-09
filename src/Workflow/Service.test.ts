import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeWorkflowRuntime } from "./Runtime";

describe("Workflow runtime", () => {
  test("loads workflow and passes args", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-workflow-runtime-"));
    const workspacePath = join(root, "workspace");
    const configRoot = join(root, "config");
    const workflowPath = join(root, "echo.ts");
    const agentScriptPath = join(root, "agent.ts");
    const outputPath = join(root, "output.txt");

    process.env.SKIPPER_CONFIG_ROOT = configRoot;

    try {
      await mkdir(workspacePath, { recursive: true });
      await mkdir(configRoot, { recursive: true });
      await writeFile(
        join(configRoot, "config.json"),
        `${JSON.stringify({ command: `bun run ${agentScriptPath}` })}\n`
      );
      await writeFile(
        agentScriptPath,
        'const prompt = process.argv[2] ?? "";\nprocess.stdout.write(`agent:${prompt}`);\n'
      );
      await writeFile(
        workflowPath,
        [
          'export default async function workflow(context, args) {',
          '  const shell = await context.shell("printf shell:$VALUE", { stdin: "ignored" });',
          '  const prompt = await context.prompt(`hello:${args.issueNumber}`);',
          `  await Bun.write(${JSON.stringify(outputPath)}, shell.stdout + ${JSON.stringify("\n")} + prompt);`,
          '}',
          "",
        ].join("\n")
      );

      await executeWorkflowRuntime({
        workflowPath,
        workspacePath,
        input: JSON.stringify({ issueNumber: 7 }),
      });

      const output = await Bun.file(outputPath).text();
      expect(output).toBe("shell:\nagent:hello:7");
    } finally {
      delete process.env.SKIPPER_CONFIG_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails when workflow default export is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "skipper-workflow-runtime-"));
    const workspacePath = join(root, "workspace");
    const configRoot = join(root, "config");
    const workflowPath = join(root, "broken.ts");

    process.env.SKIPPER_CONFIG_ROOT = configRoot;

    try {
      await mkdir(workspacePath, { recursive: true });
      await mkdir(configRoot, { recursive: true });
      await writeFile(
        join(configRoot, "config.json"),
        `${JSON.stringify({ command: "bun --version" })}\n`
      );
      await writeFile(workflowPath, "export const nope = 1;\n");

      await expect(
        executeWorkflowRuntime({
          workflowPath,
          workspacePath,
        })
      ).rejects.toThrow("default export must be a function");
    } finally {
      delete process.env.SKIPPER_CONFIG_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
