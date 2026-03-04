import { Effect, FileSystem, PlatformError, ServiceMap } from "effect";
import type { SandboxConfig } from "../domain/Sandbox";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type { UnknownError } from "effect/Cause";
import type { GitRepositoryOption } from "../domain/Git";

export const SandboxService = ServiceMap.Service<{
  create: (
    config: SandboxConfig,
    git: GitRepositoryOption
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
  remove: (
    config: SandboxConfig,
    git: GitRepositoryOption
  ) => Effect.Effect<
    void,
    PlatformError.PlatformError | UnknownError,
    FileSystem.FileSystem | ChildProcessSpawner
  >;
}>("SandboxService");
