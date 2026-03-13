import { homedir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";

const DEFAULT_REPOSITORY_ROOT = join(homedir(), ".local/share/github");
const DEFAULT_DATA_ROOT = join(homedir(), ".local/share/skipper");
const DEFAULT_CONFIG_ROOT = join(homedir(), ".config/skipper");

export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath"),
);

export type RepositoryPath = typeof RepositoryPath.Type;

export const WorkTreePath = Schema.String.pipe(Schema.brand("WorkTreePath"));

export type WorkTreePath = typeof WorkTreePath.Type;

export const WorkspacePath = Schema.String.pipe(Schema.brand("WorkspacePath"));

export type WorkspacePath = typeof WorkspacePath.Type;

export const repositoryRoot = () =>
  process.env.SKIPPER_REPOSITORY_ROOT ?? DEFAULT_REPOSITORY_ROOT;

export const dataRoot = () =>
  process.env.SKIPPER_DATA_ROOT ?? DEFAULT_DATA_ROOT;

export const configRoot = () =>
  process.env.SKIPPER_CONFIG_ROOT ?? DEFAULT_CONFIG_ROOT;

export const workTreeRoot = () =>
  process.env.SKIPPER_WORKTREE_ROOT ?? join(dataRoot(), "worktree");

export const databaseDir = () => dataRoot();

export const databasePath = () => join(databaseDir(), "skipper.db");

export const globalConfigPath = () => join(configRoot(), "config.json");

export const sandboxRoot = () =>
  process.env.SKIPPER_SANDBOX_ROOT ?? join(configRoot(), "sandbox");

export const repositorySandboxRoot = (repository: string) =>
  join(repositoryRoot(), repository, ".skipper/sandbox");

export const workflowRoot = () => join(configRoot(), "workflow");

export const workspaceWorkflowRoot = (workspacePath: string) =>
  join(workspacePath, ".skipper/workflow");

export const sanitizeNameSegment = (value: string) => {
  const clean = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length === 0 ? "default" : clean;
};

export function makeRepositoryPath(
  repository: GitRepository["repository"],
): RepositoryPath {
  return RepositoryPath.makeUnsafe(
    join(repositoryRoot(), requireRepositoryName(repository)),
  );
}

export function makeWorkTreePath(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(
    join(workTreeRoot(), git.repository, `${git.repository}.${git.branch}`),
  );
}

export function makeWorkTreeRepositoryPath(
  git: Pick<GitRepository, "repository">,
): WorkTreePath {
  return WorkTreePath.makeUnsafe(join(workTreeRoot(), git.repository));
}

export function resolveWorkspacePath(git: GitRepository): WorkspacePath {
  return WorkspacePath.makeUnsafe(
    git.branch === "main"
      ? makeRepositoryPath(git.repository)
      : makeWorkTreePath(git),
  );
}

export function workTreeRelativePathToBranch(repository: string, path: string) {
  const [head = "", ...tail] = path.split(/[\\/]/);
  const prefix = `${repository}.`;

  return [head.startsWith(prefix) ? head.slice(prefix.length) : head, ...tail]
    .filter((value) => value.length > 0)
    .join("/");
}

function requireRepositoryName(
  repository: GitRepository["repository"],
): GitRepository["repository"] {
  if (typeof repository !== "string") {
    throw new TypeError("makeRepositoryPath expected repository string");
  }

  return repository;
}

export const GitRepository = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String,
});

export type GitRepository = typeof GitRepository.Type;

export const GitRepositoryOption = Schema.Struct({
  repository: Schema.Option(Schema.String),
  branch: Schema.Option(Schema.String),
});

export type GitRepositoryOption = typeof GitRepositoryOption.Type;
