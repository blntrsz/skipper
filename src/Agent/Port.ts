import { Effect, FileSystem, PlatformError, ServiceMap } from "effect";
import type { Option } from "effect";
import type { UnknownError } from "effect/Cause";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { AgentServiceError } from "./Error";
import type { AgentCommandError } from "@/internal/AgentCommandError";
import type { AgentRunnerError } from "@/internal/AgentRunnerError";
import type { GitServiceError } from "@/internal/GitServiceError";

export type AgentRunInput = {
  readonly prompt: string;
  readonly repository: Option.Option<string>;
};

export interface AgentService {
  run: (
    input: AgentRunInput
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError | AgentServiceError | AgentCommandError | AgentRunnerError | GitServiceError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
  prompt: (
    input: AgentRunInput
  ) => Effect.Effect<
    string,
    PlatformError.PlatformError | UnknownError | AgentServiceError | AgentCommandError | AgentRunnerError | GitServiceError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
}

export const AgentService = ServiceMap.Service<AgentService>("AgentService");
