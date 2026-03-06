import { FileFinder } from "@ff-labs/bun";
import { DialogContainerRenderable, DialogManager } from "@opentui-ui/dialog";
import {
  BoxRenderable,
  InputRenderable,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
} from "@opentui/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitRepository } from "@/domain/GitRepository";
import type { GitPickerData } from "./fs";
import {
  addGitWorktreeOption,
  createGitPickerState,
  createSinglePickerState,
  getSelectedGitRepository,
  getSinglePickerSelection,
  getVisibleWindow,
  moveGitPickerSelection,
  moveSinglePickerSelection,
  removeGitWorktreeOption,
  setGitPickerFocus,
  setGitRepositoryQuery,
  setGitWorktreeQuery,
  setSinglePickerQuery,
  toggleGitPickerFocus,
  type GitPickerState,
  type OptionSearcher,
  type SinglePickerState,
} from "./model";

type SinglePickerOptions = {
  readonly title: string;
  readonly options: readonly string[];
};

type PickerColors = {
  readonly background: string;
  readonly dialogBackground: string;
  readonly foreground: string;
  readonly muted: string;
  readonly border: string;
  readonly activeBorder: string;
  readonly activeText: string;
};

type DialogState = {
  readonly active: boolean;
};

type GitPickerActions = {
  readonly removeWorktree: (gitRepository: GitRepository) => Promise<void>;
};

type ThemeMode = "dark" | "light" | null;

type TerminalColors = {
  readonly palette: readonly (string | null)[];
  readonly defaultForeground: string | null;
  readonly defaultBackground: string | null;
  readonly cursorColor: string | null;
  readonly highlightBackground: string | null;
  readonly highlightForeground: string | null;
};

const BACKSPACE = new Set(["backspace", "delete"]);
const MOVE_DOWN = new Set(["down", "j"]);
const MOVE_UP = new Set(["up", "k"]);
const MAIN_TITLE = "Skipper Picker";

const isDualPickerMoveDown = (key: { readonly name: string; readonly ctrl: boolean }) =>
  key.name === "down" || (key.ctrl && key.name === "n");

const isDualPickerMoveUp = (key: { readonly name: string; readonly ctrl: boolean }) =>
  key.name === "up" || (key.ctrl && key.name === "p");

const isPrintableCharacter = (value: string): boolean =>
  value.length === 1 && value >= " " && value !== "\u007f";

const normalizeBranchName = (value: string): string => value.trim();

const createButton = (
  renderer: CliRenderer,
  colors: PickerColors,
  label: string,
  onClick: () => void
) => {
  const box = new BoxRenderable(renderer, {
    border: true,
    paddingX: 1,
    backgroundColor: colors.background,
    borderColor: colors.border,
  });
  const text = new TextRenderable(renderer, {
    content: label,
    fg: colors.foreground,
    height: 1,
  });

  box.add(text);
  box.on("mouseUp", onClick);

  return { box, text };
};

const setButtonActive = (
  button: ReturnType<typeof createButton>,
  isActive: boolean,
  colors: PickerColors
) => {
  button.box.borderStyle = isActive ? "double" : "single";
  button.box.borderColor = isActive ? colors.activeBorder : colors.border;
  button.text.fg = isActive ? colors.activeText : colors.foreground;
};

const toRows = (
  items: readonly string[],
  selectedItem: string,
  maxVisibleItems: number
): string => {
  if (items.length === 0) {
    return "(empty)";
  }

  return getVisibleWindow(items, selectedItem, maxVisibleItems)
    .map((item) => `${item === selectedItem ? ">" : " "} ${item}`)
    .join("\n");
};

const renderSinglePicker = (
  state: SinglePickerState,
  title: string,
  renderer: CliRenderer,
  nodes: {
    readonly meta: TextRenderable;
    readonly query: TextRenderable;
    readonly listBox: BoxRenderable;
    readonly listText: TextRenderable;
  }
) => {
  const visibleCount = Math.max(5, renderer.height - 8);
  nodes.meta.content = "type search  enter confirm  esc cancel  j/k or arrows move";
  nodes.query.content = state.query.length > 0 ? state.query : "(type to filter)";
  nodes.listBox.title = `${title} (${state.filteredOptions.length})`;
  nodes.listText.content = toRows(
    state.filteredOptions,
    getSinglePickerSelection(state),
    visibleCount
  );
  renderer.requestRender();
};

const renderGitPicker = (
  state: GitPickerState,
  renderer: CliRenderer,
  colors: PickerColors,
  nodes: {
    readonly meta: TextRenderable;
    readonly repositoryQuery: TextRenderable;
    readonly worktreeQuery: TextRenderable;
    readonly repositoryBox: BoxRenderable;
    readonly repositoryText: TextRenderable;
    readonly worktreeBox: BoxRenderable;
    readonly worktreeText: TextRenderable;
  }
) => {
  const visibleCount = Math.max(2, Math.floor((renderer.height - 14) / 2));

  nodes.repositoryQuery.content =
    state.repositoryQuery.length > 0
      ? state.repositoryQuery
      : "(type to search repositories)";
  nodes.worktreeQuery.content =
    state.worktreeQuery.length > 0
      ? state.worktreeQuery
      : "(type to search worktrees)";
  nodes.repositoryBox.title = `Repositories${state.focusedPane === "repositories" ? " *" : ""} (${state.filteredRepositories.length})`;
  nodes.repositoryText.content = toRows(
    state.filteredRepositories,
    state.selectedRepository,
    visibleCount
  );
  nodes.worktreeBox.title = `Worktrees${state.focusedPane === "worktrees" ? " *" : ""} (${state.filteredWorktrees.length})`;
  nodes.worktreeText.content = toRows(
    state.filteredWorktrees,
    state.selectedWorktree,
    visibleCount
  );
  nodes.repositoryBox.borderStyle =
    state.focusedPane === "repositories" ? "double" : "single";
  nodes.repositoryBox.borderColor =
    state.focusedPane === "repositories" ? colors.activeBorder : colors.border;
  nodes.repositoryText.fg =
    state.focusedPane === "repositories" ? colors.activeText : colors.foreground;
  nodes.worktreeBox.borderStyle =
    state.focusedPane === "worktrees" ? "double" : "single";
  nodes.worktreeBox.borderColor =
    state.focusedPane === "worktrees" ? colors.activeBorder : colors.border;
  nodes.worktreeText.fg =
    state.focusedPane === "worktrees" ? colors.activeText : colors.foreground;
  renderer.requestRender();
};

const waitForScan = async () => {
  const scanResult = FileFinder.waitForScan(100);

  if (!scanResult.ok) {
    throw new Error(scanResult.error);
  }
};

const dedupeRankedResults = (
  options: readonly string[],
  ranked: readonly string[]
): readonly string[] => {
  const allowed = new Set(options);
  const seen = new Set<string>();
  const values: string[] = [];

  for (const value of ranked) {
    if (!allowed.has(value) || seen.has(value)) {
      continue;
    }

    seen.add(value);
    values.push(value);
  }

  return values;
};

const createRepositorySearcher = async (
  options: readonly string[]
): Promise<{
  readonly search: OptionSearcher;
  readonly destroy: () => Promise<void>;
}> => {
  if (options.length === 0) {
    return {
      search: () => [],
      destroy: async () => undefined,
    };
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "skipper-picker-"));
  await Promise.all(
    options.map((option) => Bun.write(join(tempDirectory, option), ""))
  );

  const initResult = FileFinder.init({
    basePath: tempDirectory,
  });

  if (!initResult.ok) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw new Error(initResult.error);
  }

  await waitForScan();

  return {
    search: (query, repositories) => {
      const result = FileFinder.search(query, { pageSize: repositories.length || 100 });

      if (!result.ok) {
        return [];
      }

      return dedupeRankedResults(
        repositories,
        result.value.items.map((item) => item.relativePath)
      );
    },
    destroy: async () => {
      FileFinder.destroy();
      await rm(tempDirectory, { recursive: true, force: true });
    },
  };
};

const substringSearch: OptionSearcher = (query, options) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return options;
  }

  return options.filter((option) =>
    option.toLocaleLowerCase().includes(normalizedQuery)
  );
};

const resolvePickerColors = (
  palette: TerminalColors | null,
  themeMode: ThemeMode
): PickerColors => ({
  background: "transparent",
  dialogBackground:
    palette?.defaultBackground ??
    (themeMode === "light" ? "#ffffff" : "#111111"),
  foreground:
    palette?.defaultForeground ??
    (themeMode === "light" ? "#111111" : "#f5f5f5"),
  muted:
    palette?.palette[8] ??
    palette?.highlightForeground ??
    (themeMode === "light" ? "#666666" : "#999999"),
  border:
    palette?.defaultForeground ??
    palette?.cursorColor ??
    (themeMode === "light" ? "#666666" : "#999999"),
  activeBorder:
    palette?.cursorColor ??
    palette?.highlightBackground ??
    palette?.defaultForeground ??
    (themeMode === "light" ? "#111111" : "#ffffff"),
  activeText:
    palette?.highlightForeground ??
    palette?.defaultForeground ??
    (themeMode === "light" ? "#111111" : "#ffffff"),
});

const getPickerColors = async (renderer: CliRenderer): Promise<PickerColors> =>
  resolvePickerColors(
    await renderer.getPalette({ timeout: 150 }).catch(() => null),
    renderer.themeMode
  );

const createRenderer = async () =>
  createCliRenderer({
    exitOnCtrlC: false,
    useConsole: false,
    useAlternateScreen: true,
  });

const createBaseLayout = (renderer: CliRenderer, colors: PickerColors) => {
  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    padding: 1,
    gap: 1,
    backgroundColor: colors.background,
  });
  const title = new TextRenderable(renderer, {
    content: MAIN_TITLE,
    width: "100%",
    height: 1,
    fg: colors.foreground,
  });
  const meta = new TextRenderable(renderer, {
    content: "",
    width: "100%",
    height: 1,
    fg: colors.muted,
  });

  renderer.root.add(root);
  root.add(title);
  root.add(meta);

  return { root, meta };
};

const createDialogs = (renderer: CliRenderer, colors: PickerColors) => {
  const manager = new DialogManager(renderer);
  const container = new DialogContainerRenderable(renderer, {
    manager,
    unstyled: true,
    closeOnEscape: true,
    dialogOptions: {
      style: {
        backgroundColor: colors.dialogBackground,
        border: true,
        borderColor: colors.activeBorder,
        padding: 1,
      },
    },
  });

  renderer.root.add(container);

  return { manager, container };
};

const showAddWorktreeDialog = async (
  renderer: CliRenderer,
  manager: DialogManager,
  colors: PickerColors,
  initialValue: string
): Promise<string | undefined> =>
  manager.prompt<string>({
    fallback: undefined,
    content: (ctx, { resolve, dismiss }) => {
      const box = new BoxRenderable(ctx, {
        width: "100%",
        flexDirection: "column",
        gap: 1,
        backgroundColor: colors.dialogBackground,
      });
      const title = new TextRenderable(ctx, {
        content: "Create worktree",
        fg: colors.foreground,
        height: 1,
      });
      const hint = new TextRenderable(ctx, {
        content: "enter create  esc cancel",
        fg: colors.muted,
        height: 1,
      });
      const input = new InputRenderable(ctx, {
        value: initialValue,
        placeholder: "worktree name",
      });

      input.on("enter", (value) => resolve(normalizeBranchName(String(value))));
      box.add(title);
      box.add(hint);
      box.add(input);
      queueMicrotask(() => input.focus());

      return box;
    },
  });

const showRemoveWorktreeDialog = async (
  renderer: CliRenderer,
  manager: DialogManager,
  colors: PickerColors,
  worktree: string
): Promise<boolean> => {
  return await manager.confirm({
    fallback: false,
    content: (ctx, { resolve, dialogId }) => {
      let selected: "no" | "yes" = "no";
      const box = new BoxRenderable(ctx, {
        width: "100%",
        flexDirection: "column",
        gap: 1,
        backgroundColor: colors.dialogBackground,
      });
      const question = new TextRenderable(ctx, {
        content: `Remove worktree '${worktree}'?`,
        fg: colors.foreground,
        height: 1,
      });
      const hint = new TextRenderable(ctx, {
        content: "left/right or tab switch  enter confirm  y/n quick select",
        fg: colors.muted,
        height: 1,
      });
      const buttons = new BoxRenderable(ctx, {
        width: "100%",
        flexDirection: "row",
        gap: 1,
        backgroundColor: colors.dialogBackground,
      });
      const noButton = createButton(renderer, colors, "No", () => resolve(false));
      const yesButton = createButton(renderer, colors, "Yes", () => resolve(true));
      const rerenderButtons = () => {
        setButtonActive(noButton, selected === "no", colors);
        setButtonActive(yesButton, selected === "yes", colors);
        renderer.requestRender();
      };
      const onKeyPress = (key: { readonly name: string }) => {
        if (manager.getTopDialog()?.id !== dialogId) {
          return;
        }

        if (key.name === "tab" || key.name === "left" || key.name === "right") {
          selected = selected === "no" ? "yes" : "no";
          rerenderButtons();
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          resolve(selected === "yes");
          return;
        }

        if (key.name === "y") {
          resolve(true);
          return;
        }

        if (key.name === "n") {
          resolve(false);
        }
      };

      renderer.keyInput.on("keypress", onKeyPress);
      box.on("removed", () => renderer.keyInput.off("keypress", onKeyPress));
      buttons.add(noButton.box);
      buttons.add(yesButton.box);
      box.add(question);
      box.add(hint);
      box.add(buttons);
      rerenderButtons();

      return box;
    },
  });
};

export const pickSingleOption = async (
  options: SinglePickerOptions
): Promise<string> => {
  const searcher = await createRepositorySearcher(options.options);

  try {
    const renderer = await createRenderer();
    const colors = await getPickerColors(renderer);
    const layout = createBaseLayout(renderer, colors);
    const queryBox = new BoxRenderable(renderer, {
      width: "100%",
      height: 3,
      border: true,
      padding: 1,
      title: "Search",
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const query = new TextRenderable(renderer, {
      width: "100%",
      height: 1,
      content: "",
      fg: colors.foreground,
    });
    const listBox = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      border: true,
      padding: 1,
      title: options.title,
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const listText = new TextRenderable(renderer, {
      width: "100%",
      height: "100%",
      content: "",
      fg: colors.foreground,
    });

    queryBox.add(query);
    listBox.add(listText);
    layout.root.add(queryBox);
    layout.root.add(listBox);

    let state = createSinglePickerState(options.options);

    return await new Promise<string>((resolve) => {
      const finish = (result: string) => {
        renderer.destroy();
        resolve(result);
      };

      const rerender = () =>
        renderSinglePicker(state, options.title, renderer, {
          meta: layout.meta,
          query,
          listBox,
          listText,
        });

      renderer.keyInput.on("keypress", (key) => {
        if (key.ctrl && key.name === "c") {
          finish("");
          return;
        }

        if (key.name === "escape") {
          finish("");
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          finish(getSinglePickerSelection(state));
          return;
        }

        if (MOVE_DOWN.has(key.name)) {
          state = moveSinglePickerSelection(state, 1);
          rerender();
          return;
        }

        if (MOVE_UP.has(key.name)) {
          state = moveSinglePickerSelection(state, -1);
          rerender();
          return;
        }

        if (BACKSPACE.has(key.name)) {
          state = setSinglePickerQuery(
            state,
            state.query.slice(0, -1),
            searcher.search
          );
          rerender();
          return;
        }

        if (isPrintableCharacter(key.sequence)) {
          state = setSinglePickerQuery(
            state,
            `${state.query}${key.sequence}`,
            searcher.search
          );
          rerender();
        }
      });

      renderer.on("resize", rerender);
      rerender();
      renderer.start();
    });
  } finally {
    await searcher.destroy();
  }
};

export const pickGitRepository = async (
  data: GitPickerData,
  actions: GitPickerActions
): Promise<GitRepository | null> => {
  const repositorySearcher = await createRepositorySearcher(data.repositories);

  try {
    const renderer = await createRenderer();
    const colors = await getPickerColors(renderer);
    const layout = createBaseLayout(renderer, colors);
    const dialogs = createDialogs(renderer, colors);
    const repositoryQueryBox = new BoxRenderable(renderer, {
      width: "100%",
      height: 3,
      border: true,
      padding: 1,
      title: "Search repositories",
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const repositoryQuery = new TextRenderable(renderer, {
      width: "100%",
      height: 1,
      content: "",
      fg: colors.foreground,
    });
    const worktreeQueryBox = new BoxRenderable(renderer, {
      width: "100%",
      height: 3,
      border: true,
      padding: 1,
      title: "Search worktrees",
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const worktreeQuery = new TextRenderable(renderer, {
      width: "100%",
      height: 1,
      content: "",
      fg: colors.foreground,
    });
    const repositoryBox = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      border: true,
      padding: 1,
      title: "Repositories",
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const repositoryText = new TextRenderable(renderer, {
      width: "100%",
      height: "100%",
      content: "",
      fg: colors.foreground,
    });
    const worktreeBox = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      border: true,
      padding: 1,
      title: "Worktrees",
      borderColor: colors.border,
      backgroundColor: colors.background,
    });
    const worktreeText = new TextRenderable(renderer, {
      width: "100%",
      height: "100%",
      content: "",
      fg: colors.foreground,
    });

    repositoryQueryBox.add(repositoryQuery);
    worktreeQueryBox.add(worktreeQuery);
    repositoryBox.add(repositoryText);
    worktreeBox.add(worktreeText);
    layout.root.add(repositoryQueryBox);
    layout.root.add(repositoryBox);
    layout.root.add(worktreeQueryBox);
    layout.root.add(worktreeBox);

    let state = createGitPickerState(
      data.repositories,
      data.worktreesByRepository,
      repositorySearcher.search,
      substringSearch
    );
    let dialogState: DialogState = { active: false };

    return await new Promise<GitRepository | null>((resolve) => {
      const finish = (result: GitRepository | null) => {
        dialogs.container.destroyRecursively();
        dialogs.manager.destroy();
        renderer.destroy();
        resolve(result);
      };

      const rerender = () => {
          renderGitPicker(state, renderer, colors, {
            meta: layout.meta,
            repositoryQuery,
            worktreeQuery,
            repositoryBox,
            repositoryText,
            worktreeBox,
            worktreeText,
          });
          layout.meta.content =
            !dialogState.active
              ? "type search  tab switch pane  enter next/select  ctrl+a add worktree  ctrl+d remove worktree  esc cancel  ctrl+n/ctrl+p or arrows move"
              : "dialog open";
          renderer.requestRender();
        };

      renderer.keyInput.on("keypress", (key) => {
        if (dialogState.active || dialogs.manager.isOpen()) {
          return;
        }

        if (key.ctrl && key.name === "c") {
          finish(null);
          return;
        }

        if (key.name === "escape") {
          finish(null);
          return;
        }

        if (key.name === "tab") {
          state = toggleGitPickerFocus(state);
          rerender();
          return;
        }

        if (
          state.focusedPane === "worktrees" &&
          key.name === "a" &&
          key.ctrl &&
          !key.meta
        ) {
          dialogState = { active: true };
          rerender();
          void showAddWorktreeDialog(
            renderer,
            dialogs.manager,
            colors,
            state.worktreeQuery
          ).then((branch) => {
            if (branch && branch.length > 0) {
              state = addGitWorktreeOption(state, branch, substringSearch);
            }

            dialogState = { active: false };
            rerender();
          });
          return;
        }

        if (
          state.focusedPane === "worktrees" &&
          key.name === "d" &&
          key.ctrl &&
          !key.meta &&
          state.selectedWorktree.length > 0 &&
          state.selectedWorktree !== "main"
        ) {
          const selectedWorktree = state.selectedWorktree;
          dialogState = { active: true };
          rerender();
          void showRemoveWorktreeDialog(
            renderer,
            dialogs.manager,
            colors,
            selectedWorktree
          ).then((confirmed) => {
            if (confirmed) {
              void actions.removeWorktree({
                repository: state.selectedRepository,
                branch: selectedWorktree,
              });
              state = removeGitWorktreeOption(state, substringSearch);
            }

            dialogState = { active: false };
            rerender();
          });
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          if (state.focusedPane === "repositories") {
            state = setGitPickerFocus(state, "worktrees");
            rerender();
            return;
          }

          finish(getSelectedGitRepository(state));
          return;
        }

        if (isDualPickerMoveDown(key)) {
          state = moveGitPickerSelection(state, 1, substringSearch);
          rerender();
          return;
        }

        if (isDualPickerMoveUp(key)) {
          state = moveGitPickerSelection(state, -1, substringSearch);
          rerender();
          return;
        }

        if (BACKSPACE.has(key.name)) {
          state =
            state.focusedPane === "repositories"
              ? setGitRepositoryQuery(
                  state,
                  state.repositoryQuery.slice(0, -1),
                  repositorySearcher.search,
                  substringSearch
                )
              : setGitWorktreeQuery(
                  state,
                  state.worktreeQuery.slice(0, -1),
                  substringSearch
                );
          rerender();
          return;
        }

        if (isPrintableCharacter(key.sequence)) {
          state =
            state.focusedPane === "repositories"
              ? setGitRepositoryQuery(
                  state,
                  `${state.repositoryQuery}${key.sequence}`,
                  repositorySearcher.search,
                  substringSearch
                )
              : setGitWorktreeQuery(
                  state,
                  `${state.worktreeQuery}${key.sequence}`,
                  substringSearch
                );
          rerender();
        }
      });

      renderer.on("resize", rerender);
      rerender();
      renderer.start();
    });
  } finally {
    await repositorySearcher.destroy();
  }
};
