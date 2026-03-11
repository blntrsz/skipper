import { Effect, FileSystem, ServiceMap } from "effect";
import type { SandboxConfig } from "../domain/Sandbox";
import type { GitRepositoryOption } from "../domain/GitRepository";
import type { Shell, Git } from "@/internal";
import type { PlatformError } from "effect/PlatformError";

export interface SandboxService {
  create: (
    config: SandboxConfig,
    git: GitRepositoryOption
  ) => Effect.Effect<
    void,
    PlatformError | Shell.ShellError | Git.GitError,
    FileSystem.FileSystem | typeof Shell.Shell.Service
  >;
  remove: (
    config: SandboxConfig,
    git: GitRepositoryOption
  ) => Effect.Effect<
    void,
    PlatformError | Shell.ShellError | Git.GitError,
    FileSystem.FileSystem | typeof Shell.Shell.Service
  >;
}

export const SandboxService =
  ServiceMap.Service<SandboxService>("SandboxService");
