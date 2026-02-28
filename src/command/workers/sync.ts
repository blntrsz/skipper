import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
  type Parameter,
} from "@aws-sdk/client-cloudformation";
import type { Command } from "commander";
import { resolveDeployDefaults } from "../aws/deploy.js";
import { classifyStackStatus } from "../aws/cloudformation.js";
import { buildTemplate } from "../aws/template.js";
import { loadWorkers } from "../../worker/load.js";
import { encodeWorkerManifest } from "../../worker/serialize.js";

type SyncOptions = {
  stackName?: string;
  region?: string;
  profile?: string;
  dir?: string;
  dryRun?: boolean;
  strict?: boolean;
  timeoutMinutes: number;
};

type SyncContext = {
  stackName: string;
  region: string;
  profile?: string;
  rootDir: string;
  timeoutMinutes: number;
  strict: boolean;
};

/**
 * Register workers sync command.
 *
 * @since 1.0.0
 * @category CLI
 */
export function registerWorkersSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync repository worker definitions into AWS stack")
    .argument("[service]", "Service name (default: current directory)")
    .argument("[env]", "Environment (default: AWS_PROFILE or sandbox)")
    .option("--stack-name <name>", "CloudFormation stack name")
    .option(
      "--region <region>",
      "AWS region (default: AWS_REGION/AWS_DEFAULT_REGION/us-east-1)",
    )
    .option("--profile <profile>", "AWS profile")
    .option("--dir <path>", "Repository root directory (default: cwd)")
    .option("--dry-run", "Print worker payload and stack target only")
    .option("--strict", "Fail when no workers are found")
    .option("--timeout-minutes <n>", "Wait timeout minutes", parseNumber, 30)
    .action(handleSyncAction);
}

/**
 * Execute workers sync action.
 *
 * @since 1.0.0
 * @category CLI
 */
async function handleSyncAction(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: SyncOptions,
): Promise<void> {
  const context = buildSyncContext(serviceArg, envArg, options);
  const workers = await loadWorkers(context.rootDir);
  if (context.strict && workers.length === 0) {
    throw new Error("no workers found in .skipper/worker/*.ts");
  }
  const encoded = encodeWorkerManifest({ workers });
  if (options.dryRun) {
    printDryRun(context, workers.map((worker) => worker.metadata.id), encoded);
    return;
  }
  await runWithProfile(context.profile, async () => {
    await syncWorkerParameters(context, encoded.parameterValues);
  });
  console.log(`Workers synced to stack ${context.stackName}`);
}

/**
 * Build normalized sync context.
 *
 * @since 1.0.0
 * @category CLI
 */
function buildSyncContext(
  serviceArg: string | undefined,
  envArg: string | undefined,
  options: SyncOptions,
): SyncContext {
  const defaults = resolveDeployDefaults();
  const service = serviceArg ?? defaults.service;
  const env = envArg ?? defaults.env;
  const region = options.region ?? defaults.region;
  if (!isSimpleName(service)) {
    throw new Error("service must match [a-zA-Z0-9-]+");
  }
  if (!isSimpleName(env)) {
    throw new Error("env must match [a-zA-Z0-9-]+");
  }
  return {
    stackName: options.stackName ?? `${service}-${env}`,
    region,
    profile: options.profile,
    rootDir: options.dir ?? process.cwd(),
    timeoutMinutes: options.timeoutMinutes,
    strict: options.strict ?? false,
  };
}

/**
 * Print workers sync dry-run payload.
 *
 * @since 1.0.0
 * @category CLI
 */
function printDryRun(
  context: SyncContext,
  workerIds: string[],
  encoded: { parameterValues: Record<string, string>; byteLength: number; workerCount: number },
): void {
  console.log(
    JSON.stringify(
      {
        stackName: context.stackName,
        region: context.region,
        workerCount: encoded.workerCount,
        workerIds,
        serializedJsonBytes: encoded.byteLength,
        workerParameterKeys: Object.keys(encoded.parameterValues).sort(),
      },
      null,
      2,
    ),
  );
}

/**
 * Sync worker parameter values into existing stack.
 *
 * @since 1.0.0
 * @category CLI
 */
async function syncWorkerParameters(
  context: SyncContext,
  workerParameters: Record<string, string>,
): Promise<void> {
  const client = new CloudFormationClient({ region: context.region });
  const stack = await readStack(client, context.stackName);
  if (stack.StackStatus?.endsWith("_IN_PROGRESS")) {
    throw new Error(`stack ${context.stackName} currently ${stack.StackStatus}`);
  }
  const previousParameters = stack.Parameters ?? [];
  const parameterUpdates = mergeWorkerParameters(previousParameters, workerParameters);

  try {
    await client.send(
      new UpdateStackCommand({
        StackName: context.stackName,
        TemplateBody: buildTemplate(),
        Capabilities: ["CAPABILITY_NAMED_IAM"],
        Parameters: parameterUpdates,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No updates are to be performed")) {
      console.log("No updates are to be performed");
      return;
    }
    throw error;
  }
  await waitForStack(client, context.stackName, context.timeoutMinutes);
}

/**
 * Merge worker patch onto current stack parameters.
 *
 * @since 1.0.0
 * @category CLI
 */
export function mergeWorkerParameters(
  previous: Parameter[],
  workerPatch: Record<string, string>,
): Parameter[] {
  const updates: Parameter[] = [];
  const seenKeys = new Set<string>();
  for (const parameter of previous) {
    if (!parameter.ParameterKey) continue;
    const key = parameter.ParameterKey;
    seenKeys.add(key);
    if (Object.prototype.hasOwnProperty.call(workerPatch, key)) {
      updates.push({ ParameterKey: key, ParameterValue: workerPatch[key] ?? "" });
      continue;
    }
    updates.push({ ParameterKey: key, UsePreviousValue: true });
  }
  for (const [key, value] of Object.entries(workerPatch)) {
    if (seenKeys.has(key)) continue;
    updates.push({ ParameterKey: key, ParameterValue: value });
  }
  return updates;
}

/**
 * Read one CloudFormation stack definition.
 *
 * @since 1.0.0
 * @category CLI
 */
async function readStack(client: CloudFormationClient, stackName: string) {
  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`stack not found: ${stackName}`);
  }
  return stack;
}

/**
 * Wait until stack reaches terminal successful state.
 *
 * @since 1.0.0
 * @category CLI
 */
async function waitForStack(
  client: CloudFormationClient,
  stackName: string,
  timeoutMinutes: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const stack = await readStack(client, stackName);
    const status = stack.StackStatus ?? "";
    const kind = classifyStackStatus(status);
    if (kind === "success") return;
    if (kind === "failure") {
      throw new Error(`stack update failed: ${status}`);
    }
    await Bun.sleep(5000);
  }
  throw new Error(`timeout waiting for stack ${stackName}`);
}

/**
 * Run callback with temporary AWS profile env.
 *
 * @since 1.0.0
 * @category CLI
 */
async function runWithProfile(
  profile: string | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const previousProfile = process.env.AWS_PROFILE;
  if (profile) {
    process.env.AWS_PROFILE = profile;
  }
  try {
    await run();
  } finally {
    if (!profile) return;
    if (previousProfile === undefined) {
      delete process.env.AWS_PROFILE;
      return;
    }
    process.env.AWS_PROFILE = previousProfile;
  }
}

/**
 * Parse positive number option.
 *
 * @since 1.0.0
 * @category CLI
 */
function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("timeout must be positive integer");
  }
  return parsed;
}

/**
 * Validate simple slug-like value.
 *
 * @since 1.0.0
 * @category CLI
 */
function isSimpleName(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}
