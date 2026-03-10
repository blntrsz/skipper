import { Effect } from "effect";
import { AgentRunnerError } from "@/internal/AgentRunnerError";
import { getErrorMessage } from "@/internal/ServiceError";

type AgentProcessResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

const ensureCommand = (command: string) => {
  const trimmed = command.trim();

  if (trimmed.length === 0) {
    throw new Error("Command must not be empty");
  }

  return trimmed;
};

export const runAgentCommand = (command: string, cwd: string, prompt: string) =>
  Effect.tryPromise({
    try: async () => {
      const ensuredCommand = ensureCommand(command);
      const result = await Bun.$`${{ raw: ensuredCommand }} ${prompt}`
        .cwd(cwd)
        .env(process.env)
        .nothrow();
      const exitCode = result.exitCode;

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
      const ensuredCommand = ensureCommand(command);
      const result = await Bun.$`${{ raw: ensuredCommand }} ${prompt}`
        .cwd(cwd)
        .env(process.env)
        .quiet()
        .nothrow();
      const stdout = result.stdout.toString();
      const stderr = result.stderr.toString();
      const exitCode = result.exitCode;

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
