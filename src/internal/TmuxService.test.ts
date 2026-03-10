import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { connectToTmuxSession } from "./TmuxService";

type Invocation = {
  args: ReadonlyArray<string>;
  options: {
    cwd?: string;
    quiet?: boolean;
  };
  failureMessage: string;
};

describe("TmuxService", () => {
  test("attaches with inherited stdio outside tmux", async () => {
    let invocation: Invocation | undefined;

    const runner = (
      args: ReadonlyArray<string>,
      options: Invocation["options"],
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
      },
      failureMessage: "Failed to attach tmux session 'skipper-main'",
    });
  });

  test("switches client inside tmux", async () => {
    let invocation: Invocation | undefined;

    const runner = (
      args: ReadonlyArray<string>,
      options: Invocation["options"],
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
