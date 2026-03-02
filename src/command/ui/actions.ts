import {
  addOrAttachWorktree,
  removeWorktree,
  runPromptInRepo,
  type SkipperPaths,
} from "../../worktree/service.js";
import type { UiActionId, UiWorktreeState } from "./model.js";

export type UiActionInput = {
  actionId: UiActionId;
  paths: SkipperPaths;
  selectedWorktree?: UiWorktreeState;
  promptInput?: string;
  confirmationInput?: string;
};

export type UiActionResult = {
  statusMessage: string;
  shouldRefresh: boolean;
  shouldExit: boolean;
};

/**
 * Execute one UI action and return status outcome.
 *
 * @since 1.0.2
 * @category CLI
 */
export async function executeUiAction(input: UiActionInput): Promise<UiActionResult> {
  if (input.actionId === "quit") {
    return { statusMessage: "Bye", shouldRefresh: false, shouldExit: true };
  }
  if (input.actionId === "refresh") {
    return { statusMessage: "Refreshed", shouldRefresh: true, shouldExit: false };
  }
  const selectedWorktree = input.selectedWorktree;
  if (!selectedWorktree) {
    return noSelectionResult("Select a worktree first");
  }
  if (input.actionId === "checkout") {
    await addOrAttachWorktree(
      input.paths,
      selectedWorktree.repo,
      selectedWorktree.worktree,
    );
    return {
      statusMessage: `Attached ${selectedWorktree.repo}/${selectedWorktree.worktree}`,
      shouldRefresh: false,
      shouldExit: false,
    };
  }
  if (input.actionId === "remove") {
    if (!isConfirmationAccepted(input.confirmationInput)) {
      return noSelectionResult("Removal cancelled");
    }
    await removeWorktree(input.paths, selectedWorktree);
    return {
      statusMessage: `Removed ${selectedWorktree.repo}/${selectedWorktree.worktree}`,
      shouldRefresh: true,
      shouldExit: false,
    };
  }
  if (input.actionId === "run") {
    const prompt = normalizeRunPrompt(input.promptInput);
    if (!prompt) {
      return noSelectionResult("Enter prompt first");
    }
    await runPromptInRepo(input.paths, selectedWorktree.repo, prompt);
    return {
      statusMessage: `Run complete for ${selectedWorktree.repo}`,
      shouldRefresh: false,
      shouldExit: false,
    };
  }
  return noSelectionResult("Unsupported action");
}

/**
 * Normalize run prompt input.
 *
 * @since 1.0.2
 * @category CLI
 */
export function normalizeRunPrompt(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Validate remove confirmation input.
 *
 * @since 1.0.2
 * @category CLI
 */
export function isConfirmationAccepted(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "yes";
}

/**
 * Build standard selection-missing action result.
 *
 * @since 1.0.2
 * @category CLI
 */
function noSelectionResult(statusMessage: string): UiActionResult {
  return {
    statusMessage,
    shouldRefresh: false,
    shouldExit: false,
  };
}
