import { Schema } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "./GitRepository";

export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath")
);

export type RepositoryPath = typeof RepositoryPath.Type;

const REPOSITORY_ROOT = join(homedir(), ".local/share/github");

/**
 * Build the repository root path for a repo name.
 *
 * @since 1.2.3
 * @category Shared
 */
export function make(repository: GitRepository["repository"]): RepositoryPath {
  return RepositoryPath.makeUnsafe(
    join(REPOSITORY_ROOT, requireRepositoryName(repository))
  );
}

/**
 * Return the base directory that contains cloned repositories.
 *
 * @since 1.2.3
 * @category Shared
 */
export function root() {
  return REPOSITORY_ROOT;
}

/**
 * Validate repository name input before path construction.
 *
 * @since 1.2.3
 * @category Shared
 */
function requireRepositoryName(
  repository: GitRepository["repository"]
): GitRepository["repository"] {
  if (typeof repository !== "string") {
    throw new TypeError("RepositoryPath.make expected repository string");
  }

  return repository;
}
