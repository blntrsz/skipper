import {
  collectWorktrees,
  buildSessionName,
  tmuxSessionExists,
  type SkipperPaths,
} from "../../worktree/service.js";

export type UiActionId = "checkout" | "remove" | "run" | "refresh" | "quit";

export type UiWorktreeState = {
  key: string;
  repo: string;
  worktree: string;
  path: string;
  sessionName: string;
  sessionRunning: boolean;
};

export type UiState = {
  worktrees: UiWorktreeState[];
  selectedWorktreeKey: string | undefined;
  statusMessage: string;
};

export type BuildUiStateInput = {
  paths: SkipperPaths;
  selectedWorktreeKey?: string;
  statusMessage?: string;
};

/**
 * Build refreshed UI state from filesystem and tmux.
 *
 * @since 1.0.2
 * @category CLI
 */
export async function buildUiState(input: BuildUiStateInput): Promise<UiState> {
  const worktrees = await buildWorktreeStates(input.paths);
  const selectedWorktreeKey = resolveSelectedWorktreeKey(
    worktrees,
    input.selectedWorktreeKey,
  );
  return {
    worktrees,
    selectedWorktreeKey,
    statusMessage: input.statusMessage ?? "Ready",
  };
}

/**
 * Find currently selected worktree item in UI state.
 *
 * @since 1.0.2
 * @category CLI
 */
export function findSelectedWorktree(state: UiState): UiWorktreeState | undefined {
  const key = state.selectedWorktreeKey;
  if (!key) return undefined;
  return state.worktrees.find((worktree) => worktree.key === key);
}

/**
 * Resolve selected worktree key with fallback to first value.
 *
 * @since 1.0.2
 * @category CLI
 */
export function resolveSelectedWorktreeKey(
  worktrees: UiWorktreeState[],
  selectedWorktreeKey?: string,
): string | undefined {
  if (selectedWorktreeKey && worktrees.some((worktree) => worktree.key === selectedWorktreeKey)) {
    return selectedWorktreeKey;
  }
  return worktrees[0]?.key;
}

/**
 * Build worktree state list from all local repositories.
 *
 * @since 1.0.2
 * @category CLI
 */
async function buildWorktreeStates(
  paths: SkipperPaths,
): Promise<UiWorktreeState[]> {
  const worktrees = await collectWorktrees(paths);
  const states: UiWorktreeState[] = [];
  for (const worktreeRef of worktrees) {
    const sessionName = buildSessionName(worktreeRef.repo, worktreeRef.worktree);
    const sessionRunning = await tmuxSessionExists(sessionName);
    states.push({
      key: `${worktreeRef.repo}/${worktreeRef.worktree}`,
      repo: worktreeRef.repo,
      worktree: worktreeRef.worktree,
      path: worktreeRef.path,
      sessionName,
      sessionRunning,
    });
  }
  states.sort((a, b) => a.key.localeCompare(b.key));
  return states;
}
