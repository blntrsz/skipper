import { Effect } from "effect";
import { pathToFileURL } from "node:url";
import { globalConfigPath } from "@/internal/SkipperPaths";
import { captureAgentCommand } from "@/internal/AgentRunner";
import type { WorkflowContext, WorkflowModule, WorkflowShellOptions } from "./contract";

type WorkflowRuntimePayload = {
  readonly workflowPath: string;
  readonly workspacePath: string;
  readonly input?: string;
};

const loadWorkflowModule = async (workflowPath: string): Promise<WorkflowModule> => {
  const module = await import(pathToFileURL(workflowPath).href);
  const workflow = module.default;

  if (typeof workflow !== "function") {
    throw new Error(`Workflow '${workflowPath}' default export must be a function`);
  }

  return workflow as WorkflowModule;
};

const loadInput = (input: string | undefined) => {
  if (input === undefined || input.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid workflow input JSON: ${error}`);
  }
};

const loadCommand = async () => {
  const path = globalConfigPath();
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new Error(`Missing command in ${path}. Add { "command": "opencode run" }`);
  }

  const parsed = JSON.parse(await file.text()) as { command?: unknown };

  if (typeof parsed.command !== "string" || parsed.command.trim().length === 0) {
    throw new Error(`Missing command in ${path}. Add { "command": "opencode run" }`);
  }

  return parsed.command.trim();
};

const runShell = async (
  cwd: string,
  command: string,
  options?: WorkflowShellOptions
) => {
  let shell = Bun.$`${{ raw: command }}`.cwd(cwd).env(process.env).quiet().nothrow();

  if (options?.stdin !== undefined) {
    shell = Bun.$`${{ raw: command }} < ${new Response(options.stdin)}`
      .cwd(cwd)
      .env(process.env)
      .quiet()
      .nothrow();
  }

  const result = await shell;
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  const exitCode = result.exitCode;

  if (exitCode !== 0) {
    throw new Error(
      stderr.trim().length > 0
        ? `Shell command failed (${exitCode}): ${stderr.trim()}`
        : `Shell command failed (${exitCode}): ${command}`
    );
  }

  return { stdout, stderr, exitCode };
};

export const executeWorkflowRuntime = async (payload: WorkflowRuntimePayload) => {
  const workflow = await loadWorkflowModule(payload.workflowPath);
  const agentCommand = await loadCommand();
  const context: WorkflowContext = {
    shell: (command, options) => runShell(payload.workspacePath, command, options),
    prompt: async (text) => {
      const result = await Effect.runPromise(
        captureAgentCommand(agentCommand, payload.workspacePath, text)
      );

      return result.stdout;
    },
  };

  await workflow(context, loadInput(payload.input));
};

const payloadArg = process.argv[2];

if (import.meta.main) {
  if (payloadArg === undefined) {
    throw new Error("Missing workflow runtime payload");
  }

  const payload = JSON.parse(payloadArg) as WorkflowRuntimePayload;
  await executeWorkflowRuntime(payload);
}
