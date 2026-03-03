import { Schema } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "./Git";

export const WorkTreePath = Schema.String.pipe(Schema.brand("WorkTreePath"));

export type WorkTreePath = typeof WorkTreePath.Type;

export function make(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(
    join(homedir(), ".local/share/skipper/worktree", git.repository, git.branch)
  );
}
