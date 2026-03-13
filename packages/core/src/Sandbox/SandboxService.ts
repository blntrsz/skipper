import { type Effect, type FileSystem, ServiceMap } from "effect";
import type { PlatformError } from "effect/PlatformError";
import type { GitRepositoryOption } from "../domain/Path";
import type { SandboxConfig } from "../domain/Sandbox";
import type * as Git from "../internal/Git";
import type * as Shell from "../internal/Shell";

export interface SandboxService {
  create: (
    config: SandboxConfig,
    git: GitRepositoryOption,
  ) => Effect.Effect<
    void,
    PlatformError | Shell.ShellError | Git.GitError,
    | FileSystem.FileSystem
    | typeof Git.GitService.Service
    | typeof Shell.ShellService.Service
  >;
  remove: (
    config: SandboxConfig,
    git: GitRepositoryOption,
  ) => Effect.Effect<
    void,
    PlatformError | Shell.ShellError | Git.GitError,
    | FileSystem.FileSystem
    | typeof Git.GitService.Service
    | typeof Shell.ShellService.Service
  >;
}

export const SandboxService =
  ServiceMap.Service<SandboxService>("SandboxService");
