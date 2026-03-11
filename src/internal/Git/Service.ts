import { Effect, FileSystem, Option, Schema, ServiceMap } from "effect";
import type { RepositoryPath as RepositoryPathType } from "@/domain/RepositoryPath";
import type { WorkTreePath } from "@/domain/WorkTreePath";
import type {
  GitRepository,
  GitRepositoryOption,
} from "@/domain/GitRepository";
import * as Shell from "../Shell";

export class GitError extends Schema.TaggedErrorClass<GitError>(
  "skipper/GitError"
)("GitError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export const Git = ServiceMap.Service<{
  createWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath,
    git: GitRepository
  ) => Effect.Effect<void, Shell.ShellError, typeof Shell.Shell.Service>;
  removeWorkTree: (
    repositoryPath: RepositoryPathType,
    workTreePath: WorkTreePath
  ) => Effect.Effect<void, Shell.ShellError, typeof Shell.Shell.Service>;
  resolveGitRepository: (
    git: GitRepositoryOption
  ) => Effect.Effect<GitRepository, GitError, never>;
  resolveRepositoryName: (
    repository: Option.Option<string>
  ) => Effect.Effect<string, GitError, never>;
  ensureRepositoryExists: (
    repository: string
  ) => Effect.Effect<string, GitError, FileSystem.FileSystem>;
}>("GitService");
