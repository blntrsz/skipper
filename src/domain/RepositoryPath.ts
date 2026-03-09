import { Schema } from "effect";
import { join } from "node:path";
import type { GitRepository } from "./GitRepository";
import { repositoryRoot } from "@/internal/SkipperPaths";

export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath")
);

export type RepositoryPath = typeof RepositoryPath.Type;

/**
 * Build the repository root path for a repo name.
 *
 * @since 1.2.3
 * @category Shared
 */
export function make(repository: GitRepository["repository"]): RepositoryPath {
  return RepositoryPath.makeUnsafe(
    join(repositoryRoot(), requireRepositoryName(repository))
  );
}

/**
 * Return the base directory that contains cloned repositories.
 *
 * @since 1.2.3
 * @category Shared
 */
export function root() {
  return repositoryRoot();
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
