/** @effect-diagnostics strictEffectProvide:off */
import { localWorkTreeLayer } from "@skippercorp/core/runtime/local-work-tree.runtime";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { rootCommand } from "../src/command.ts";
import { extractPickedBranch } from "../src/command/workspace/workspace.common";

const EmptyConfigProvider = ConfigProvider.fromUnknown({});

describe("cli dry-run", () => {
  it("extracts picked branch from worktree folder name", () => {
    expect(extractPickedBranch("skipper", "skipper.testingnewbranching")).toBe(
      "testingnewbranching",
    );
    expect(extractPickedBranch("acme/widgets", "acme/widgets.feat/test")).toBe("feat/test");
    expect(extractPickedBranch("skipper", "testingnewbranching")).toBe("testingnewbranching");
  });

  it.effect("snapshots workspace attach alias output", () =>
    Effect.gen(function* () {
      const run = Command.runWith(rootCommand, { version: "test" });

      yield* run([
        "w",
        "a",
        "--dry-run",
        "--repository",
        "acme/widgets",
        "--branch",
        "feat/test",
      ]).pipe(
        Effect.provide(localWorkTreeLayer),
        Effect.provideService(ConfigProvider.ConfigProvider, EmptyConfigProvider),
      );

      const output = (yield* TestConsole.logLines).map(String).join("\n");

      expect(output).toMatchInlineSnapshot(`
        "{
          "_tag": "StandardCommand",
          "command": "which",
          "args": ["tmux"],
          "options": {}
        }
        {
          "_tag": "StandardCommand",
          "command": "tmux",
          "args": [
            "has-session",
            "-t",
            "acme/widgets-feat/test"
          ],
          "options": {}
        }
        {
          "_tag": "StandardCommand",
          "command": "tmux",
          "args": [
            "attach-session",
            "-t",
            "acme/widgets-feat/test"
          ],
          "options": {"shell":true}
        }"
      `);
    }).pipe(Effect.provide(TestConsole.layer)),
  );
});
