import type { GitRepository } from "./GitRepository";
import * as RepositoryPath from "./RepositoryPath";
import * as WorkTreePath from "./WorkTreePath";

export const resolveWorkspacePath = (git: GitRepository) =>
  git.branch === "main"
    ? RepositoryPath.make(git.repository)
    : WorkTreePath.make(git);
