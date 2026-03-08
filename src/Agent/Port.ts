import { Effect, FileSystem, PlatformError, ServiceMap } from "effect";
import type { Option } from "effect";
import type { UnknownError } from "effect/Cause";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

export type AgentRunInput = {
  readonly prompt: string;
  readonly repository: Option.Option<string>;
};

export interface AgentService {
  run: (
    input: AgentRunInput
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
}

export const AgentService = ServiceMap.Service<AgentService>("AgentService");
