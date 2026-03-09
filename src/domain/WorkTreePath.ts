import { Schema } from "effect";
import { join } from "node:path";
import type { GitRepository } from "./GitRepository";
import { workTreeRoot } from "@/internal/SkipperPaths";

export const WorkTreePath = Schema.String.pipe(Schema.brand("WorkTreePath"));

export type WorkTreePath = typeof WorkTreePath.Type;

export function make(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(
    join(workTreeRoot(), git.repository, git.branch)
  );
}

export function makeRepositoryPath(git: GitRepository): WorkTreePath {
  return WorkTreePath.makeUnsafe(join(workTreeRoot(), git.repository));
}

export function root() {
  return workTreeRoot();
}
