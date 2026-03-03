import { Schema } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "./Git";

export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath")
);

export type RepositoryPath = typeof RepositoryPath.Type;

export function make(git: GitRepository): RepositoryPath {
  return RepositoryPath.makeUnsafe(
    join(homedir(), ".local/share/github", git.repository)
  );
}
