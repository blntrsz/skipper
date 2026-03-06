import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import * as RepositoryPath from "@/domain/RepositoryPath";
import * as WorkTreePath from "@/domain/WorkTreePath";

export type GitPickerData = {
  readonly repositories: readonly string[];
  readonly worktreesByRepository: ReadonlyMap<string, readonly string[]>;
};

const MAIN_BRANCH = "main";

type EntryWithTimestamp = {
  readonly name: string;
  readonly modifiedAt: number;
};

const sortEntriesByModifiedAt = (
  entries: readonly EntryWithTimestamp[]
): readonly string[] =>
  [...entries]
    .filter((entry) => entry.name.trim().length > 0)
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.name.localeCompare(right.name)
    )
    .map((entry) => entry.name);

const uniqueEntries = (
  entries: readonly EntryWithTimestamp[]
): readonly EntryWithTimestamp[] => {
  const seen = new Set<string>();
  const result: EntryWithTimestamp[] = [];

  for (const entry of entries) {
    if (seen.has(entry.name)) {
      continue;
    }

    seen.add(entry.name);
    result.push(entry);
  }

  return result;
};

const readModifiedAt = async (path: string): Promise<number> => {
  try {
    const file = await stat(path);
    return file.mtimeMs;
  } catch {
    return 0;
  }
};

const readEntriesWithTimestamps = async (
  directory: string,
  predicate?: (entry: Dirent<string>) => boolean
): Promise<readonly EntryWithTimestamp[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const filteredEntries = predicate ? entries.filter(predicate) : entries;

    return await Promise.all(
      filteredEntries.map(async (entry) => ({
        name: entry.name,
        modifiedAt: await readModifiedAt(join(directory, entry.name)),
      }))
    );
  } catch {
    return [];
  }
};

const readEntryNames = async (directory: string): Promise<readonly string[]> =>
  sortEntriesByModifiedAt(await readEntriesWithTimestamps(directory));

const readDirectoryNames = async (
  directory: string
): Promise<readonly string[]> =>
  sortEntriesByModifiedAt(
    await readEntriesWithTimestamps(directory, (entry) => entry.isDirectory())
  );

export const readPickerOptions = async (
  directory: string,
  additionalOptions: readonly string[] = []
): Promise<readonly string[]> => {
  const additionalEntries = additionalOptions.map((name) => ({
    name,
    modifiedAt: Number.MAX_SAFE_INTEGER,
  }));

  return sortEntriesByModifiedAt(
    uniqueEntries([
      ...additionalEntries,
      ...(await readEntriesWithTimestamps(directory)),
    ])
  );
};

export const readRepositoryNames = async (): Promise<readonly string[]> =>
  readDirectoryNames(RepositoryPath.root());

export const readWorktreeNames = async (
  repository: string
): Promise<readonly string[]> => {
  const directory = WorkTreePath.makeRepositoryPath({
    repository,
    branch: MAIN_BRANCH,
  });
  const mainModifiedAt = await readModifiedAt(RepositoryPath.make(repository));
  const worktrees = await readEntriesWithTimestamps(directory, (entry) =>
    entry.isDirectory()
  );

  return sortEntriesByModifiedAt(uniqueEntries([
    { name: MAIN_BRANCH, modifiedAt: mainModifiedAt },
    ...worktrees,
  ]));
};

export const readGitPickerData = async (): Promise<GitPickerData> => {
  const repositories = await readRepositoryNames();
  const worktreeEntries = await Promise.all(
    repositories.map(async (repository) => [repository, await readWorktreeNames(repository)] as const)
  );

  return {
    repositories,
    worktreesByRepository: new Map(worktreeEntries),
  };
};
