import { Effect, ServiceMap } from "effect";
import { clearScreenDown, cursorTo, emitKeypressEvents, moveCursor } from "node:readline";
import { Picker, PickerCancelled, PickerError, PickerNoMatch } from "./Service";

const MAX_VISIBLE = 8;
const normalize = (s: string) => s.trim().toLowerCase();

const filter = (query: string, options: string[]): string[] => {
  if (!query) return options;
  return options
    .map((opt) => {
      const n = normalize(opt);
      const score = n.startsWith(query) ? 0 : n.indexOf(query) === -1 ? Infinity : n.indexOf(query) + 1;
      return { opt, score };
    })
    .filter((x) => isFinite(x.score))
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.opt.localeCompare(b.opt)))
    .map((x) => x.opt);
};

export const TerminalPicker = ServiceMap.make(Picker, {
  pick: ({ options, message }) =>
    Effect.callback<string, PickerCancelled | PickerError | PickerNoMatch>((resume) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        resume(Effect.fail(new PickerError({ message: "Interactive picker requires a TTY" })));
        return;
      }
      if (options.length === 0) {
        resume(Effect.fail(new PickerError({ message: `No options available for ${message}` })));
        return;
      }

      emitKeypressEvents(process.stdin);
      process.stdin.resume();
      process.stdin.setRawMode?.(true);

      let query = "";
      let idx = 0;
      let prevLines = 0;

      const cleanup = () => {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.off("keypress", onKeypress);
        if (prevLines > 0) {
          moveCursor(process.stdout, 0, -(prevLines - 1));
          cursorTo(process.stdout, 0);
          clearScreenDown(process.stdout);
        }
        process.stdout.write("\x1b[?25h");
      };

      const matches = () => filter(normalize(query), options);

      const render = () => {
        const m = matches();
        idx = Math.max(0, Math.min(idx, Math.max(m.length - 1, 0)));
        const start = Math.max(0, Math.min(idx, Math.max(m.length - MAX_VISIBLE, 0)));
        const visible = m.slice(start, start + MAX_VISIBLE);
        const lines = [
          `${message}: ${query}`,
          ...(visible.length === 0
            ? ["  No matches"]
            : visible.map((opt, i) => (start + i === idx ? `> ${opt}` : `  ${opt}`))),
        ];
        process.stdout.write("\x1b[?25l");
        if (prevLines > 0) {
          moveCursor(process.stdout, 0, -(prevLines - 1));
          cursorTo(process.stdout, 0);
        }
        clearScreenDown(process.stdout);
        process.stdout.write(lines.join("\n"));
        prevLines = lines.length;
      };

      const onKeypress = (value: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
        const m = matches();

        if (key.name === "up" || (key.ctrl && key.name === "p")) {
          if (m.length) idx = Math.max(0, idx - 1);
          render();
          return;
        }
        if (key.name === "down" || (key.ctrl && key.name === "n")) {
          if (m.length) idx = Math.min(m.length - 1, idx + 1);
          render();
          return;
        }
        if (key.ctrl && key.name === "c") {
          cleanup();
          process.stdout.write("\n");
          resume(Effect.fail(new PickerCancelled({})));
          return;
        }

        switch (key.name) {
          case "backspace":
            query = query.slice(0, -1);
            idx = 0;
            render();
            break;
          case "return": {
            const sel = m[idx];
            if (sel !== undefined) {
              cleanup();
              process.stdout.write(`${message}: ${sel}\n`);
              resume(Effect.succeed(sel));
            } else {
              cleanup();
              process.stdout.write("\n");
              resume(Effect.fail(new PickerNoMatch({ query })));
            }
            break;
          }
          case "escape":
            cleanup();
            process.stdout.write("\n");
            resume(Effect.fail(new PickerCancelled({})));
            break;
          default:
            if (value?.length === 1 && !key.ctrl && !key.meta) {
              query += value;
              idx = 0;
              render();
            }
        }
      };

      process.stdin.on("keypress", onKeypress);
      render();
    }),
});
