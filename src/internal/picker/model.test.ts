import { describe, expect, test } from "bun:test";
import {
  addGitWorktreeOption,
  createGitPickerState,
  createSinglePickerState,
  getSelectedGitRepository,
  moveGitPickerSelection,
  removeGitWorktreeOption,
  setGitRepositoryQuery,
  setGitWorktreeQuery,
  setSinglePickerQuery,
  toggleGitPickerFocus,
} from "./model";

const fuzzySearch = (query: string, items: readonly string[]) => {
  const lowerQuery = query.toLowerCase();

  return items.filter((item) => item.toLowerCase().includes(lowerQuery));
};

describe("picker model", () => {
  test("single picker filters and keeps first visible match", () => {
    const state = createSinglePickerState(["alpha", "beta", "gamma"]);
    const next = setSinglePickerQuery(state, "ga", fuzzySearch);

    expect(next.filteredOptions).toEqual(["gamma"]);
    expect(next.selectedIndex).toBe(0);
  });

  test("repo hover updates worktree selection live", () => {
    const state = createGitPickerState(
      ["api", "web"],
      new Map([
        ["api", ["main", "feature-a"]],
        ["web", ["main", "feature-b"]],
      ]),
      fuzzySearch,
      fuzzySearch
    );

    const moved = moveGitPickerSelection(state, 1, fuzzySearch);

    expect(moved.selectedRepository).toBe("web");
    expect(moved.selectedWorktree).toBe("main");
  });

  test("query narrows repositories and preserves worktree fallback", () => {
    const state = createGitPickerState(
      ["api", "web"],
      new Map([
        ["api", ["main", "feature-a"]],
        ["web", ["main"]],
      ]),
      fuzzySearch,
      fuzzySearch
    );

    const next = setGitRepositoryQuery(state, "we", fuzzySearch, fuzzySearch);

    expect(next.filteredRepositories).toEqual(["web"]);
    expect(next.selectedRepository).toBe("web");
    expect(next.selectedWorktree).toBe("main");
  });

  test("worktree query filters bottom pane", () => {
    const state = createGitPickerState(
      ["api"],
      new Map([["api", ["main", "feature-a", "bugfix"]]]),
      fuzzySearch,
      fuzzySearch
    );

    const next = setGitWorktreeQuery(toggleGitPickerFocus(state), "bug", fuzzySearch);

    expect(next.filteredWorktrees).toEqual(["bugfix"]);
    expect(next.selectedWorktree).toBe("bugfix");
  });

  test("add worktree prepends and selects new option", () => {
    const state = createGitPickerState(
      ["api"],
      new Map([["api", ["main", "feature-a"]]]),
      fuzzySearch,
      fuzzySearch
    );

    const next = addGitWorktreeOption(
      toggleGitPickerFocus(state),
      "feature-b",
      fuzzySearch
    );

    expect(next.filteredWorktrees).toContain("feature-b");
    expect(next.selectedWorktree).toBe("feature-b");
  });

  test("remove worktree removes current selection but keeps main", () => {
    const state = toggleGitPickerFocus(
      createGitPickerState(
        ["api"],
        new Map([["api", ["main", "feature-a", "feature-b"]]]),
        fuzzySearch,
        fuzzySearch
      )
    );
    const selected = moveGitPickerSelection(state, 2, fuzzySearch);
    const next = removeGitWorktreeOption(selected, fuzzySearch);

    expect(next.filteredWorktrees).toEqual(["main", "feature-a"]);
    expect(next.selectedWorktree).toBe("main");
  });

  test("entering worktree pane returns selected git repository", () => {
    const state = toggleGitPickerFocus(
      createGitPickerState(
        ["api"],
        new Map([["api", ["main", "fix-bug"]]]),
        fuzzySearch,
        fuzzySearch
      )
    );
    const moved = moveGitPickerSelection(state, 1, fuzzySearch);

    expect(getSelectedGitRepository(moved)).toEqual({
      repository: "api",
      branch: "fix-bug",
    });
  });
});
