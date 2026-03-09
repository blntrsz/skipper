import { Effect, FileSystem, PlatformError, ServiceMap } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { Option } from "effect";
import type { WorkflowServiceError } from "./Error";

export type WorkflowRunInput = {
  readonly repository: Option.Option<string>;
  readonly branch: Option.Option<string>;
  readonly input: Option.Option<string>;
};

export interface WorkflowService {
  run: (
    input: WorkflowRunInput
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | WorkflowServiceError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
}

export const WorkflowService = ServiceMap.Service<WorkflowService>("WorkflowService");
