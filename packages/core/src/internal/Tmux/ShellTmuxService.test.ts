import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import * as Shell from "../Shell";
import { TmuxService } from "./TmuxService";
import { ShellTmuxService } from "./ShellTmuxService";

type CommandCall =
  | { type: "bool"; command: string }
  | { type: "$"; command: string }
  | { type: "exec"; command: string[] };

const runAttachSession = (
  shell: Shell.ShellService,
  options: { sessionName?: string; path?: string } = {},
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const tmux = yield* TmuxService;

      return yield* tmux.attachSession(
        options.sessionName ?? "repo-main",
        options.path ?? "/tmp/repo",
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.effectServices(Effect.succeed(ShellTmuxService)),
          Layer.succeed(Shell.ShellService, shell),
        ),
      ),
    ),
  );

describe("ShellTmuxService", () => {
  const tmux = process.env.TMUX;

  beforeEach(() => {
    delete process.env.TMUX;
  });

  afterEach(() => {
    if (tmux === undefined) {
      delete process.env.TMUX;
      return;
    }

    process.env.TMUX = tmux;
  });

  test("fails with friendly message when tmux is missing", async () => {
    const shell: Shell.ShellService = {
      bool: ({ command }) => Effect.succeed(command !== "command -v tmux >/dev/null 2>&1"),
      $: () => Effect.succeed(""),
      exec: () => Effect.void,
      run: () => Effect.die("not used"),
    };

    await expect(runAttachSession(shell)).rejects.toMatchObject({
      message: "tmux is required for sandbox switch. Install tmux and retry.",
    });
  });

  test("creates and attaches session when no tmux server exists", async () => {
    const calls: CommandCall[] = [];
    const shell: Shell.ShellService = {
      bool: ({ command }) => {
        calls.push({ type: "bool", command });

        switch (command) {
          case "command -v tmux >/dev/null 2>&1":
            return Effect.succeed(true);
          case "tmux has-session -t repo-main":
            return Effect.succeed(false);
          default:
            return Effect.succeed(false);
        }
      },
      $: ({ command }) => {
        calls.push({ type: "$", command });
        return Effect.succeed("");
      },
      exec: ({ command }) => {
        calls.push({ type: "exec", command });
        return Effect.void;
      },
      run: () => Effect.die("not used"),
    };

    await runAttachSession(shell);

    expect(calls).toEqual([
      { type: "bool", command: "command -v tmux >/dev/null 2>&1" },
      { type: "bool", command: "tmux has-session -t repo-main" },
      { type: "$", command: "tmux new-session -d -s repo-main -c /tmp/repo" },
      { type: "exec", command: ["env", "-u", "TMUX", "tmux", "attach-session", "-t", "repo-main"] },
    ]);
  });

  test("falls back to attach when TMUX env is stale", async () => {
    process.env.TMUX = "/tmp/tmux-stale";

    const calls: CommandCall[] = [];
    const shell: Shell.ShellService = {
      bool: ({ command }) => {
        calls.push({ type: "bool", command });

        switch (command) {
          case "command -v tmux >/dev/null 2>&1":
            return Effect.succeed(true);
          case "tmux has-session -t repo-main":
            return Effect.succeed(true);
          case "tmux display-message -p '#S' >/dev/null 2>&1":
            return Effect.succeed(false);
          default:
            return Effect.succeed(false);
        }
      },
      $: ({ command }) => {
        calls.push({ type: "$", command });
        return Effect.succeed("");
      },
      exec: ({ command }) => {
        calls.push({ type: "exec", command });
        return Effect.void;
      },
      run: () => Effect.die("not used"),
    };

    await runAttachSession(shell);

    expect(calls).toEqual([
      { type: "bool", command: "command -v tmux >/dev/null 2>&1" },
      { type: "bool", command: "tmux has-session -t repo-main" },
      { type: "bool", command: "tmux display-message -p '#S' >/dev/null 2>&1" },
      { type: "exec", command: ["env", "-u", "TMUX", "tmux", "attach-session", "-t", "repo-main"] },
    ]);
  });
});
