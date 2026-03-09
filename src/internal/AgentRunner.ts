import { Effect } from "effect";
import { AgentRunnerError } from "@/internal/AgentRunnerError";
import { getErrorMessage } from "@/internal/ServiceError";

type AgentProcessResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export const splitCommand = (command: string): ReadonlyArray<string> =>
  command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

const ensureCommand = (command: string) => {
  const parts = splitCommand(command);

  if (parts[0] === undefined) {
    throw new Error("Command must not be empty");
  }

  return parts;
};

const readText = async (stream: ReadableStream<Uint8Array> | null) =>
  stream === null ? "" : await new Response(stream).text();

export const runAgentCommand = (command: string, cwd: string, prompt: string) =>
  Effect.tryPromise({
    try: async () => {
      const parts = ensureCommand(command);
      const proc = Bun.spawn([...parts, prompt], {
        cwd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
      });
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(`Command failed with exit code ${exitCode}`);
      }
    },
    catch: (error) =>
      new AgentRunnerError({
        message: getErrorMessage(error, "Failed to run agent command"),
        cause: error,
      }),
  });

export const captureAgentCommand = (
  command: string,
  cwd: string,
  prompt: string
) =>
  Effect.tryPromise({
    try: async (): Promise<AgentProcessResult> => {
      const parts = ensureCommand(command);
      const proc = Bun.spawn([...parts, prompt], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        readText(proc.stdout),
        readText(proc.stderr),
        proc.exited,
      ]);

      if (exitCode !== 0) {
        throw new Error(
          stderr.trim().length > 0
            ? `Command failed with exit code ${exitCode}: ${stderr.trim()}`
            : `Command failed with exit code ${exitCode}`
        );
      }

      return { stdout, stderr, exitCode };
    },
    catch: (error) =>
      new AgentRunnerError({
        message: getErrorMessage(error, "Failed to capture agent command output"),
        cause: error,
      }),
  });
