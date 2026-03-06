import type { GitRepository } from "@/domain/GitRepository";

export type PickerFocus = "repositories" | "worktrees";

export type OptionSearcher = (
  query: string,
  options: readonly string[]
) => readonly string[];

export type SinglePickerState = {
  readonly options: readonly string[];
  readonly filteredOptions: readonly string[];
  readonly query: string;
  readonly selectedIndex: number;
};

export type GitPickerState = {
  readonly repositories: readonly string[];
  readonly filteredRepositories: readonly string[];
  readonly worktreesByRepository: ReadonlyMap<string, readonly string[]>;
  readonly filteredWorktrees: readonly string[];
  readonly repositoryQuery: string;
  readonly worktreeQuery: string;
  readonly focusedPane: PickerFocus;
  readonly selectedRepository: string;
  readonly selectedWorktree: string;
};

const clampIndex = (index: number, length: number) => {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, length - 1));
};

const resolveFilteredRepositories = (
  repositories: readonly string[],
  query: string,
  searcher: OptionSearcher
): readonly string[] => {
  if (repositories.length === 0) {
    return [];
  }

  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return repositories;
  }

  const ranked = searcher(normalizedQuery, repositories);

  if (ranked.length > 0) {
    return ranked;
  }

  const lowerQuery = normalizedQuery.toLocaleLowerCase();
  return repositories.filter((repository) =>
    repository.toLocaleLowerCase().includes(lowerQuery)
  );
};

const resolveSelectedValue = (
  options: readonly string[],
  previousValue: string
): string => {
  if (options.length === 0) {
    return "";
  }

  return options.includes(previousValue) ? previousValue : options[0] ?? "";
};

const resolveWorktrees = (
  worktreesByRepository: ReadonlyMap<string, readonly string[]>,
  repository: string
): readonly string[] => worktreesByRepository.get(repository) ?? [];

const resolveFilteredWorktrees = (
  worktreesByRepository: ReadonlyMap<string, readonly string[]>,
  repository: string,
  query: string,
  searcher: OptionSearcher
): readonly string[] =>
  resolveFilteredRepositories(
    resolveWorktrees(worktreesByRepository, repository),
    query,
    searcher
  );

export const createSinglePickerState = (
  options: readonly string[]
): SinglePickerState => ({
  options,
  filteredOptions: options,
  query: "",
  selectedIndex: 0,
});

export const setSinglePickerQuery = (
  state: SinglePickerState,
  query: string,
  searcher: OptionSearcher
): SinglePickerState => {
  const filteredOptions = resolveFilteredRepositories(
    state.options,
    query,
    searcher
  );
  const selectedValue = getSinglePickerSelection(state);
  const nextSelection = resolveSelectedValue(filteredOptions, selectedValue);

  return {
    ...state,
    query,
    filteredOptions,
    selectedIndex: Math.max(0, filteredOptions.indexOf(nextSelection)),
  };
};

export const moveSinglePickerSelection = (
  state: SinglePickerState,
  delta: number
): SinglePickerState => ({
  ...state,
  selectedIndex: clampIndex(
    state.selectedIndex + delta,
    state.filteredOptions.length
  ),
});

export const getSinglePickerSelection = (
  state: SinglePickerState
): string => state.filteredOptions[state.selectedIndex] ?? "";

export const createGitPickerState = (
  repositories: readonly string[],
  worktreesByRepository: ReadonlyMap<string, readonly string[]>,
  repositorySearcher: OptionSearcher,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  const filteredRepositories = resolveFilteredRepositories(
    repositories,
    "",
    repositorySearcher
  );
  const selectedRepository = filteredRepositories[0] ?? "";
  const filteredWorktrees = resolveFilteredWorktrees(
    worktreesByRepository,
    selectedRepository,
    "",
    worktreeSearcher
  );

  return {
    repositories,
    filteredRepositories,
    worktreesByRepository,
    filteredWorktrees,
    repositoryQuery: "",
    worktreeQuery: "",
    focusedPane: "repositories",
    selectedRepository,
    selectedWorktree: filteredWorktrees[0] ?? "",
  };
};

export const setGitRepositoryQuery = (
  state: GitPickerState,
  query: string,
  repositorySearcher: OptionSearcher,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  const filteredRepositories = resolveFilteredRepositories(
    state.repositories,
    query,
    repositorySearcher
  );
  const selectedRepository = resolveSelectedValue(
    filteredRepositories,
    state.selectedRepository
  );
  const filteredWorktrees = resolveFilteredWorktrees(
    state.worktreesByRepository,
    selectedRepository,
    state.worktreeQuery,
    worktreeSearcher
  );

  return {
    ...state,
    repositoryQuery: query,
    focusedPane: "repositories",
    filteredRepositories,
    filteredWorktrees,
    selectedRepository,
    selectedWorktree: resolveSelectedValue(
      filteredWorktrees,
      state.selectedWorktree
    ),
  };
};

export const setGitWorktreeQuery = (
  state: GitPickerState,
  query: string,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  const filteredWorktrees = resolveFilteredWorktrees(
    state.worktreesByRepository,
    state.selectedRepository,
    query,
    worktreeSearcher
  );

  return {
    ...state,
    worktreeQuery: query,
    focusedPane: "worktrees",
    filteredWorktrees,
    selectedWorktree: resolveSelectedValue(
      filteredWorktrees,
      state.selectedWorktree
    ),
  };
};

export const addGitWorktreeOption = (
  state: GitPickerState,
  worktree: string,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  const nextWorktree = worktree.trim();

  if (nextWorktree.length === 0 || state.selectedRepository.length === 0) {
    return state;
  }

  const currentWorktrees = resolveWorktrees(
    state.worktreesByRepository,
    state.selectedRepository
  );
  const nextWorktrees = currentWorktrees.includes(nextWorktree)
    ? currentWorktrees
    : [nextWorktree, ...currentWorktrees];
  const worktreesByRepository = new Map(state.worktreesByRepository);
  worktreesByRepository.set(state.selectedRepository, nextWorktrees);
  const filteredWorktrees = resolveFilteredWorktrees(
    worktreesByRepository,
    state.selectedRepository,
    "",
    worktreeSearcher
  );

  return {
    ...state,
    worktreesByRepository,
    filteredWorktrees,
    worktreeQuery: "",
    focusedPane: "worktrees",
    selectedWorktree: nextWorktree,
  };
};

export const removeGitWorktreeOption = (
  state: GitPickerState,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  if (
    state.selectedRepository.length === 0 ||
    state.selectedWorktree.length === 0 ||
    state.selectedWorktree === "main"
  ) {
    return state;
  }

  const currentWorktrees = resolveWorktrees(
    state.worktreesByRepository,
    state.selectedRepository
  ).filter((worktree) => worktree !== state.selectedWorktree);
  const worktreesByRepository = new Map(state.worktreesByRepository);
  worktreesByRepository.set(state.selectedRepository, currentWorktrees);
  const filteredWorktrees = resolveFilteredWorktrees(
    worktreesByRepository,
    state.selectedRepository,
    state.worktreeQuery,
    worktreeSearcher
  );

  return {
    ...state,
    worktreesByRepository,
    filteredWorktrees,
    selectedWorktree: resolveSelectedValue(
      filteredWorktrees,
      currentWorktrees[0] ?? ""
    ),
  };
};

export const moveGitPickerSelection = (
  state: GitPickerState,
  delta: number,
  worktreeSearcher: OptionSearcher
): GitPickerState => {
  if (state.focusedPane === "worktrees") {
    if (state.filteredWorktrees.length === 0) {
      return state;
    }

    const currentIndex = Math.max(
      0,
      state.filteredWorktrees.indexOf(state.selectedWorktree)
    );
    return {
      ...state,
      selectedWorktree:
        state.filteredWorktrees[
          clampIndex(currentIndex + delta, state.filteredWorktrees.length)
        ] ?? "",
    };
  }

  if (state.filteredRepositories.length === 0) {
    return state;
  }

  const currentIndex = Math.max(
    0,
    state.filteredRepositories.indexOf(state.selectedRepository)
  );
  const selectedRepository =
    state.filteredRepositories[
      clampIndex(currentIndex + delta, state.filteredRepositories.length)
    ] ?? "";
  const filteredWorktrees = resolveFilteredWorktrees(
    state.worktreesByRepository,
    selectedRepository,
    state.worktreeQuery,
    worktreeSearcher
  );

  return {
    ...state,
    selectedRepository,
    filteredWorktrees,
    selectedWorktree: resolveSelectedValue(
      filteredWorktrees,
      state.selectedWorktree
    ),
  };
};

export const setGitPickerFocus = (
  state: GitPickerState,
  focusedPane: PickerFocus
): GitPickerState => ({
  ...state,
  focusedPane,
});

export const toggleGitPickerFocus = (state: GitPickerState): GitPickerState =>
  setGitPickerFocus(
    state,
    state.focusedPane === "repositories" ? "worktrees" : "repositories"
  );

export const getSelectedGitRepository = (
  state: GitPickerState
): GitRepository | null => {
  if (state.selectedRepository.length === 0 || state.selectedWorktree.length === 0) {
    return null;
  }

  return {
    repository: state.selectedRepository,
    branch: state.selectedWorktree,
  };
};

export const getVisibleWindow = <T>(
  items: readonly T[],
  selectedValue: T | undefined,
  maxVisibleItems: number
): readonly T[] => {
  if (items.length <= maxVisibleItems) {
    return items;
  }

  const safeVisibleItems = Math.max(1, maxVisibleItems);
  const selectedIndex = Math.max(0, items.indexOf(selectedValue as T));
  const start = clampIndex(
    selectedIndex - Math.floor(safeVisibleItems / 2),
    Math.max(1, items.length - safeVisibleItems + 1)
  );

  return items.slice(start, start + safeVisibleItems);
};
