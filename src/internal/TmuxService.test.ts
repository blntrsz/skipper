import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { connectToTmuxSession } from "./TmuxService";

describe("TmuxService", () => {
  test("attaches with inherited stdio outside tmux", async () => {
    let invocation:
      | {
          args: ReadonlyArray<string>;
          options: Record<string, string>;
          failureMessage: string;
        }
      | undefined;

    const runner = (
      args: ReadonlyArray<string>,
      options: Record<string, string>,
      failureMessage: string
    ) =>
      Effect.sync(() => {
        invocation = { args, options, failureMessage };
      });

    await Effect.runPromise(
      connectToTmuxSession(runner, "skipper-main", "/tmp/skipper", false)
    );

    expect(invocation).toEqual({
      args: ["attach-session", "-t", "skipper-main"],
      options: {
        cwd: "/tmp/skipper",
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
      failureMessage: "Failed to attach tmux session 'skipper-main'",
    });
  });

  test("switches client inside tmux", async () => {
    let invocation:
      | {
          args: ReadonlyArray<string>;
          options: Record<string, string>;
          failureMessage: string;
        }
      | undefined;

    const runner = (
      args: ReadonlyArray<string>,
      options: Record<string, string>,
      failureMessage: string
    ) =>
      Effect.sync(() => {
        invocation = { args, options, failureMessage };
      });

    await Effect.runPromise(
      connectToTmuxSession(runner, "skipper-main", "/tmp/skipper", true)
    );

    expect(invocation).toEqual({
      args: ["switch-client", "-t", "skipper-main"],
      options: {
        cwd: "/tmp/skipper",
      },
      failureMessage: "Failed to switch tmux session 'skipper-main'",
    });
  });
});
