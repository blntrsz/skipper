import { Effect, PlatformError, Schema, Scope, ServiceMap } from "effect";
import type { ChildProcess } from "effect/unstable/process";
import type { ProjectModel } from "../domain";
import type { InteractiveCommandError } from "../../common/adapter/interactive-command.service";
import type { WorkspaceHandle } from "./workspace-registry.service";

export const SandboxErrorReason = Schema.Union([
  Schema.Literal("UncommittedChanges"),
  Schema.Literal("AttachFailed"),
  Schema.Literal("DetachFailed"),
  Schema.Literal("ExecutionFailed"),
]);

export class SandboxError extends Schema.TaggedErrorClass<SandboxError>("SandboxError")(
  "SandboxError",
  {
    message: Schema.String,
    reason: SandboxErrorReason,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export type SandboxInitInput = {
  project: ProjectModel;
  mainProjectPath: string;
  mainExists: boolean;
  branchPath?: string;
};

export type SandboxDestroyInput = {
  project: ProjectModel;
  mainProjectPath?: string;
  branchPath?: string;
  force?: boolean;
};

export class SandboxService extends ServiceMap.Service<
  SandboxService,
  {
    init: (
      input: SandboxInitInput,
    ) => Effect.Effect<void, SandboxError | PlatformError.PlatformError, Scope.Scope>;
    destroy: (
      input: SandboxDestroyInput,
    ) => Effect.Effect<void, SandboxError | PlatformError.PlatformError, Scope.Scope>;
    execute: (
      workspace: WorkspaceHandle,
      command: string,
      options?: ChildProcess.CommandOptions,
    ) => Effect.Effect<void, SandboxError | PlatformError.PlatformError, Scope.Scope>;
    attach: (
      workspace: WorkspaceHandle,
    ) => Effect.Effect<
      void,
      SandboxError | PlatformError.PlatformError | InteractiveCommandError,
      Scope.Scope
    >;
    detach: (
      project: ProjectModel,
    ) => Effect.Effect<void, SandboxError | PlatformError.PlatformError, Scope.Scope>;
  }
>()("@skippercorp/core/workspace/port/sandbox.service/SandboxService") {}
