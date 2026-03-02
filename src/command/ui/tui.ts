import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { executeUiAction } from "./actions.js";
import {
  buildUiState,
  findSelectedWorktree,
  type UiActionId,
  type UiState,
} from "./model.js";
import { createSkipperPaths } from "../../worktree/service.js";

type PromptMode = "none" | "runPrompt" | "removeConfirm";

/**
 * Run local worktree dashboard TUI.
 *
 * @since 1.0.2
 * @category CLI
 */
export async function runUiTui(): Promise<void> {
  const paths = createSkipperPaths();
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  let state = await buildUiState({ paths, statusMessage: "Ready" });
  let promptMode: PromptMode = "none";
  let shuttingDown = false;

  const rootLayout = new BoxRenderable(renderer, {
    id: "ui-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    gap: 1,
    padding: 1,
    backgroundColor: "#11141a",
  });
  const headerText = new TextRenderable(renderer, {
    id: "ui-header",
    content: "Skipper UI - worktree list",
    fg: "#d9e4f2",
  });
  const worktreeBox = new BoxRenderable(renderer, {
    id: "worktree-box",
    width: "100%",
    height: "100%",
    borderStyle: "rounded",
    borderColor: "#2a3548",
    title: "Worktrees",
    padding: 1,
    gap: 1,
  });
  const worktreeSelect = new SelectRenderable(renderer, {
    id: "worktree-select",
    width: "100%",
    height: 16,
    options: [],
    showDescription: true,
  });
  const selectedDetail = new TextRenderable(renderer, {
    id: "selected-detail",
    content: "No worktree selected",
    fg: "#b0bccd",
  });
  const inputBox = new BoxRenderable(renderer, {
    id: "input-box",
    width: "100%",
    borderStyle: "rounded",
    borderColor: "#30466a",
    title: "Input",
    padding: 1,
    gap: 1,
  });
  const inputHint = new TextRenderable(renderer, {
    id: "input-hint",
    content: "",
    fg: "#d9e4f2",
  });
  const inputField = new InputRenderable(renderer, {
    id: "input-field",
    width: "100%",
    placeholder: "",
    value: "",
    textColor: "#d9e4f2",
    focusedBackgroundColor: "#1f2b3d",
  });
  const statusLine = new TextRenderable(renderer, {
    id: "status-line",
    content: "Ready",
    fg: "#9fb3c8",
  });
  const helpLine = new TextRenderable(renderer, {
    id: "help-line",
    content: "Enter checkout | p run prompt | d remove | r refresh | q quit | Esc cancel",
    fg: "#6f8196",
  });

  worktreeBox.add(worktreeSelect);
  worktreeBox.add(selectedDetail);
  inputBox.add(inputHint);
  inputBox.add(inputField);
  rootLayout.add(headerText);
  rootLayout.add(worktreeBox);
  rootLayout.add(inputBox);
  rootLayout.add(statusLine);
  rootLayout.add(helpLine);
  renderer.root.add(rootLayout);

  const refreshState = async (statusMessage: string): Promise<void> => {
    state = await buildUiState({
      paths,
      selectedWorktreeKey: state.selectedWorktreeKey,
      statusMessage,
    });
    worktreeSelect.options = toWorktreeOptions(state);
    statusLine.content = state.statusMessage;
    updateSelectedDetail();
  };

  const updateSelectedDetail = (): void => {
    const selected = findSelectedWorktree(state);
    if (!selected) {
      selectedDetail.content = "No worktree selected";
      return;
    }
    const tmuxState = selected.sessionRunning ? "running" : "stopped";
    selectedDetail.content = `${selected.repo}/${selected.worktree} | tmux ${tmuxState}`;
  };

  const clearPromptMode = (statusMessage: string): void => {
    promptMode = "none";
    inputHint.content = "";
    inputField.placeholder = "";
    inputField.value = "";
    statusLine.content = statusMessage;
    worktreeSelect.focus();
  };

  const applyActionResult = async (
    statusMessage: string,
    shouldRefresh: boolean,
    shouldExit: boolean,
  ): Promise<void> => {
    if (shouldExit) {
      shuttingDown = true;
      renderer.destroy();
      return;
    }
    if (shouldRefresh) {
      await refreshState(statusMessage);
      worktreeSelect.focus();
      return;
    }
    statusLine.content = statusMessage;
    worktreeSelect.focus();
  };

  const runAction = async (
    actionId: UiActionId,
    extras: {
      promptInput?: string;
      confirmationInput?: string;
    } = {},
  ): Promise<void> => {
    const result = await executeUiAction({
      actionId,
      paths,
      selectedWorktree: findSelectedWorktree(state),
      ...extras,
    });
    await applyActionResult(result.statusMessage, result.shouldRefresh, result.shouldExit);
  };

  const startRunPrompt = (): void => {
    const selected = findSelectedWorktree(state);
    if (!selected) {
      statusLine.content = "Select a worktree first";
      return;
    }
    promptMode = "runPrompt";
    inputHint.content = `Run prompt in ${selected.repo}`;
    inputField.placeholder = "prompt";
    inputField.value = "";
    inputField.focus();
  };

  const startRemoveConfirm = (): void => {
    const selected = findSelectedWorktree(state);
    if (!selected) {
      statusLine.content = "Select a worktree first";
      return;
    }
    promptMode = "removeConfirm";
    inputHint.content = `Type yes to remove ${selected.repo}/${selected.worktree}`;
    inputField.placeholder = "yes";
    inputField.value = "";
    inputField.focus();
  };

  const handlePromptSubmit = async (value: string): Promise<void> => {
    if (promptMode === "runPrompt") {
      promptMode = "none";
      inputHint.content = "";
      inputField.placeholder = "";
      inputField.value = "";
      await runAction("run", { promptInput: value });
      return;
    }
    if (promptMode === "removeConfirm") {
      promptMode = "none";
      inputHint.content = "";
      inputField.placeholder = "";
      inputField.value = "";
      await runAction("remove", { confirmationInput: value });
    }
  };

  const handleKeypress = async (key: KeyEvent): Promise<void> => {
    if (key.name === "escape") {
      if (promptMode !== "none") {
        clearPromptMode("Input cancelled");
      } else {
        shuttingDown = true;
        renderer.destroy();
      }
      return;
    }
    if (promptMode !== "none") {
      return;
    }
    if (key.name === "q") {
      await runAction("quit");
      return;
    }
    if (key.name === "r") {
      await runAction("refresh");
      return;
    }
    if (key.name === "p") {
      startRunPrompt();
      return;
    }
    if (key.name === "d") {
      startRemoveConfirm();
    }
  };

  worktreeSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const selected = state.worktrees[index];
    state = {
      ...state,
      selectedWorktreeKey: selected?.key,
    };
    updateSelectedDetail();
  });

  worktreeSelect.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    void runAction("checkout");
  });

  inputField.on(InputRenderableEvents.ENTER, (value: string) => {
    void handlePromptSubmit(value);
  });

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    void handleKeypress(key);
  });

  await refreshState(state.statusMessage);
  worktreeSelect.focus();

  try {
    while (!renderer.isDestroyed && !shuttingDown) {
      await Bun.sleep(80);
    }
  } finally {
    if (!renderer.isDestroyed) {
      renderer.destroy();
    }
  }
}

/**
 * Build select options for worktree list.
 *
 * @since 1.0.2
 * @category CLI
 */
function toWorktreeOptions(state: UiState): SelectOption[] {
  if (state.worktrees.length === 0) {
    return [{ name: "No worktrees found", description: "Create one with skipper a" }];
  }
  return state.worktrees.map((worktree) => ({
    name: `${worktree.repo}/${worktree.worktree}`,
    description: worktree.sessionRunning ? "tmux running" : "tmux stopped",
    value: worktree.key,
  }));
}
