import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_REPOSITORY_ROOT = join(homedir(), ".local/share/github");
const DEFAULT_DATA_ROOT = join(homedir(), ".local/share/skipper");
const DEFAULT_CONFIG_ROOT = join(homedir(), ".config/skipper");

export const repositoryRoot = () =>
  process.env.SKIPPER_REPOSITORY_ROOT ?? DEFAULT_REPOSITORY_ROOT;

export const dataRoot = () => process.env.SKIPPER_DATA_ROOT ?? DEFAULT_DATA_ROOT;

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

export const sanitizeNameSegment = (value: string) => {
  const clean = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length === 0 ? "default" : clean;
};
