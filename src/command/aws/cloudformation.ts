import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
  type Output,
  type StackEvent,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";

const SUCCESS_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const FAILURE_STATES = new Set([
  "CREATE_FAILED",
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "DELETE_FAILED",
  "UPDATE_ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_FAILED",
]);

export type DeployStackInput = {
  client: CloudFormationClient;
  stackName: string;
  templateBody: string;
  parameters: Record<string, string>;
  timeoutMinutes: number;
  tags?: Record<string, string>;
};

export type DeployStackResult = {
  action: "create" | "update" | "noop";
  status: string;
  outputs: Output[];
};

export function classifyStackStatus(status: string):
  | "success"
  | "failure"
  | "in-progress" {
  if (SUCCESS_STATES.has(status)) return "success";
  if (FAILURE_STATES.has(status)) return "failure";
  return "in-progress";
}

export async function deployStack(
  input: DeployStackInput,
): Promise<DeployStackResult> {
  const exists = await stackExists(input.client, input.stackName);

  if (!exists) {
    await input.client.send(
      new CreateStackCommand({
        StackName: input.stackName,
        TemplateBody: input.templateBody,
        Parameters: toCfnParameters(input.parameters),
        Tags: toCfnTags(input.tags),
        Capabilities: ["CAPABILITY_NAMED_IAM"],
      }),
    );

    const status = await waitForTerminalStatus(
      input.client,
      input.stackName,
      input.timeoutMinutes,
    );
    const outputs = await getOutputs(input.client, input.stackName);
    return { action: "create", status, outputs };
  }

  const current = await getStackStatus(input.client, input.stackName);
  if (current.endsWith("_IN_PROGRESS")) {
    throw new Error(`Stack ${input.stackName} currently ${current}`);
  }

  try {
    await input.client.send(
      new UpdateStackCommand({
        StackName: input.stackName,
        TemplateBody: input.templateBody,
        Parameters: toCfnParameters(input.parameters),
        Tags: toCfnTags(input.tags),
        Capabilities: ["CAPABILITY_NAMED_IAM"],
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No updates are to be performed")) {
      const outputs = await getOutputs(input.client, input.stackName);
      return { action: "noop", status: current, outputs };
    }
    throw error;
  }

  const status = await waitForTerminalStatus(
    input.client,
    input.stackName,
    input.timeoutMinutes,
  );
  const outputs = await getOutputs(input.client, input.stackName);
  return { action: "update", status, outputs };
}

export async function getFailureSummary(
  client: CloudFormationClient,
  stackName: string,
): Promise<string[]> {
  const res = await client.send(
    new DescribeStackEventsCommand({ StackName: stackName }),
  );

  const events = (res.StackEvents ?? [])
    .filter((event: StackEvent) => {
      const status = event.ResourceStatus ?? "";
      return status.includes("FAILED") || status.includes("ROLLBACK");
    })
    .slice(0, 10)
    .map((event: StackEvent) => {
      const id = event.LogicalResourceId ?? "unknown";
      const status = event.ResourceStatus ?? "unknown";
      const reason = event.ResourceStatusReason ?? "no reason";
      return `${id}: ${status} - ${reason}`;
    });

  return events;
}

async function stackExists(
  client: CloudFormationClient,
  stackName: string,
): Promise<boolean> {
  try {
    await client.send(new DescribeStacksCommand({ StackName: stackName }));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist")) return false;
    throw error;
  }
}

async function getStackStatus(
  client: CloudFormationClient,
  stackName: string,
): Promise<string> {
  const res = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack?.StackStatus) throw new Error(`Cannot read stack status: ${stackName}`);
  return stack.StackStatus;
}

async function waitForTerminalStatus(
  client: CloudFormationClient,
  stackName: string,
  timeoutMinutes: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const status = await getStackStatus(client, stackName);
    const kind = classifyStackStatus(status);
    if (kind === "success") return status;
    if (kind === "failure") {
      throw new Error(`Stack failed: ${status}`);
    }
    await Bun.sleep(5000);
  }
  throw new Error(`Timed out waiting for stack ${stackName}`);
}

async function getOutputs(
  client: CloudFormationClient,
  stackName: string,
): Promise<Output[]> {
  const res = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  return stack?.Outputs ?? [];
}

function toCfnParameters(parameters: Record<string, string>) {
  return Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({
    ParameterKey,
    ParameterValue,
  }));
}

function toCfnTags(tags?: Record<string, string>) {
  if (!tags) return undefined;
  return Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
}
