import { Effect } from "effect";
import { UnknownError } from "effect/Cause";
import {
  clearScreenDown,
  cursorTo,
  emitKeypressEvents,
  moveCursor,
} from "node:readline";

export class PickerCancelled {
  readonly _tag = "PickerCancelled";
}

export type PickerOption<T> = {
  readonly label: string;
  readonly value: T;
};

const MAX_VISIBLE_OPTIONS = 8;

const normalize = (value: string) => value.trim().toLowerCase();

const scoreOption = (query: string, label: string) => {
  if (query.length === 0) {
    return 0;
  }

  const normalizedLabel = normalize(label);

  if (normalizedLabel.startsWith(query)) {
    return 0;
  }

  const matchIndex = normalizedLabel.indexOf(query);
  return matchIndex === -1 ? Number.POSITIVE_INFINITY : matchIndex + 1;
};

const filterOptions = <T>(
  query: string,
  options: ReadonlyArray<PickerOption<T>>
): ReadonlyArray<PickerOption<T>> => {
  if (query.length === 0) {
    return options;
  }

  return [...options]
    .map((option) => ({ option, score: scoreOption(query, option.label) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.option.label.localeCompare(right.option.label);
    })
    .map((entry) => entry.option);
};

const isPrintableKey = (value: string, ctrl: boolean, meta: boolean) =>
  value.length === 1 && ctrl === false && meta === false;

export const pickOne = <T>(
  title: string,
  options: ReadonlyArray<PickerOption<T>>
) =>
  Effect.tryPromise({
    try: () =>
      new Promise<T>((resolve, reject) => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          reject(new UnknownError(undefined, "Interactive picker requires a TTY"));
          return;
        }

        if (options.length === 0) {
          reject(new UnknownError(undefined, `No options available for ${title}`));
          return;
        }

        emitKeypressEvents(process.stdin);
        process.stdin.resume();
        process.stdin.setRawMode?.(true);

        let query = "";
        let selectedIndex = 0;
        let previousLineCount = 0;

        const cleanup = () => {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("keypress", onKeypress);

          if (previousLineCount > 0) {
            moveCursor(process.stdout, 0, -(previousLineCount - 1));
            cursorTo(process.stdout, 0);
            clearScreenDown(process.stdout);
          }

          process.stdout.write("\x1b[?25h");
        };

        const getMatches = () => filterOptions(normalize(query), options);

        const render = () => {
          const matches = getMatches();
          const clampedIndex = Math.max(
            0,
            Math.min(selectedIndex, Math.max(matches.length - 1, 0))
          );

          selectedIndex = clampedIndex;

          const windowStart = Math.max(
            0,
            Math.min(
              selectedIndex,
              Math.max(matches.length - MAX_VISIBLE_OPTIONS, 0)
            )
          );
          const visibleOptions = matches.slice(
            windowStart,
            windowStart + MAX_VISIBLE_OPTIONS
          );
          const lines = [
            `${title}: ${query}`,
            ...(visibleOptions.length === 0
              ? ["  No matches"]
              : visibleOptions.map((option, index) =>
                  windowStart + index === selectedIndex
                    ? `> ${option.label}`
                    : `  ${option.label}`
                )),
          ];

          process.stdout.write("\x1b[?25l");

          if (previousLineCount > 0) {
            moveCursor(process.stdout, 0, -(previousLineCount - 1));
            cursorTo(process.stdout, 0);
          }

          clearScreenDown(process.stdout);
          process.stdout.write(lines.join("\n"));
          previousLineCount = lines.length;
        };

        const finish = (value: T) => {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
        };

        const cancel = () => {
          cleanup();
          process.stdout.write("\n");
          reject(new PickerCancelled());
        };

        const onKeypress = (value: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
          const matches = getMatches();

          const isMoveUp = key.name === "up" || (key.ctrl === true && key.name === "p");
          const isMoveDown = key.name === "down" || (key.ctrl === true && key.name === "n");

          if (isMoveUp) {
            if (matches.length > 0) {
              selectedIndex = Math.max(0, selectedIndex - 1);
            }
            render();
            return;
          }

          if (isMoveDown) {
            if (matches.length > 0) {
              selectedIndex = Math.min(matches.length - 1, selectedIndex + 1);
            }
            render();
            return;
          }

          switch (key.name) {
            case "backspace":
              query = query.slice(0, -1);
              selectedIndex = 0;
              render();
              return;
            case "return": {
              const selected = matches[selectedIndex];

              if (selected !== undefined) {
                finish(selected.value);
              }
              return;
            }
            case "escape":
              cancel();
              return;
            default:
              break;
          }

          if (key.ctrl === true && key.name === "c") {
            cancel();
            return;
          }

          if (isPrintableKey(value, key.ctrl === true, key.meta === true)) {
            query += value;
            selectedIndex = 0;
            render();
          }
        };

        process.stdin.on("keypress", onKeypress);
        render();
      }),
    catch: (error) =>
      error instanceof PickerCancelled || error instanceof UnknownError
        ? error
        : new UnknownError(error, `Failed to read ${title} selection`),
  });
