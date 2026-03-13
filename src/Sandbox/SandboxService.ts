import { Effect, FileSystem, ServiceMap } from "effect";
import type { SandboxConfig } from "../domain/Sandbox";
import type { GitRepositoryOption } from "../domain/GitRepository";
import * as Git from "@/internal/Git";
import * as Shell from "@/internal/Shell";
import type { PlatformError } from "effect/PlatformError";

export interface SandboxService {
  create: (
    config: SandboxConfig,
    git: GitRepositoryOption
  ) => Effect.Effect<
    void,
    PlatformError | Shell.ShellError | Git.GitError,
    | FileSystem.FileSystem
    | typeof Git.GitService.Service
    | typeof Shell.ShellService.Service
  >;
  remove: (
    config: SandboxConfig,
    git: GitRepositoryOption
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
