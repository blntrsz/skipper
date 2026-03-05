import { Schema } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "./GitRepository";

export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath")
);

export type RepositoryPath = typeof RepositoryPath.Type;

const REPOSITORY_ROOT = join(homedir(), ".local/share/github");

export function make(git: GitRepository): RepositoryPath {
  return RepositoryPath.makeUnsafe(join(REPOSITORY_ROOT, git.repository));
}

export function root() {
  return REPOSITORY_ROOT;
}
