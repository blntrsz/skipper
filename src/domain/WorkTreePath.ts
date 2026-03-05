import { Schema } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "./GitRepository";

export const WorkTreePath = Schema.String.pipe(Schema.brand("WorkTreePath"));

export type WorkTreePath = typeof WorkTreePath.Type;

const WORKTREE_ROOT = join(homedir(), ".local/share/skipper/worktree");

export function make(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(
    join(WORKTREE_ROOT, git.repository, git.branch)
  );
}

export function makeRepositoryPath(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(join(WORKTREE_ROOT, git.repository));
}

export function root() {
  return WORKTREE_ROOT;
}
