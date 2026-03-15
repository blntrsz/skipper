import { type Effect, type FileSystem, type Option, Schema, ServiceMap } from "effect";
import type { GitRepository, GitRepositoryOption } from "../../domain/GitRepository";
import type { RepositoryPath as RepositoryPathType, WorkTreePath } from "../../domain/Path";
import type * as Shell from "../Shell";

export class GitError extends Schema.TaggedErrorClass<GitError>("skipper/GitError")("GitError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export interface GitService {
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
    git: GitRepository,
  ) => Effect.Effect<void, Shell.ShellError, typeof Shell.ShellService.Service>;
  removeWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
  ) => Effect.Effect<void, Shell.ShellError, typeof Shell.ShellService.Service>;
  resolveGitRepository: (git: GitRepositoryOption) => Effect.Effect<GitRepository, GitError, never>;
  resolveRepositoryName: (
    repository: Option.Option<string>,
  ) => Effect.Effect<string, GitError, never>;
  ensureRepositoryExists: (
    repository: string,
  ) => Effect.Effect<string, GitError, FileSystem.FileSystem>;
}

export const GitService = ServiceMap.Service<GitService>("GitService");
