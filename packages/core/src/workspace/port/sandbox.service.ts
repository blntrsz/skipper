import { Effect, PlatformError, Schema, Scope, ServiceMap } from "effect";
import type { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type { FileSystemError } from "./file-system.service";
import type { ProjectModel } from "../domain";

export class SandboxError extends Schema.TaggedErrorClass<SandboxError>("SandboxError")(
  "SandboxError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class SandboxService extends ServiceMap.Service<
  SandboxService,
  {
    init: () => Effect.Effect<void, SandboxError, never>;
    destroy: () => Effect.Effect<void, SandboxError | FileSystemError, never>;
    execute: (
      command: ChildProcess.Command,
    ) => Effect.Effect<
      void,
      SandboxError | PlatformError.PlatformError,
      ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
    >;
    attach: (
      project: ProjectModel,
      path: string,
    ) => Effect.Effect<
      void,
      SandboxError | PlatformError.PlatformError,
      ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
    >;
    detach: (
      project: ProjectModel,
    ) => Effect.Effect<
      void,
      SandboxError | PlatformError.PlatformError,
      ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
    >;
  }
>()("@skippercorp/core/workspace/port/sandbox.service/SandboxService") {}
