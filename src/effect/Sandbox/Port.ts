import { Effect, FileSystem, PlatformError, ServiceMap, Scope } from "effect";
import type { SandboxConfig } from "../domain/Sandbox";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { UnknownError } from "effect/Cause";

export const SandboxService = ServiceMap.Service<{
  create: (
    config: SandboxConfig
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner | Scope.Scope
  >;
  remove: (
    config: SandboxConfig
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner | Scope.Scope
  >;
}>("SandboxService");
