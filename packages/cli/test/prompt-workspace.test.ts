/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { joinPromptArgs } from "../src/command/workspace/prompt-workspace.command";

describe("workspace prompt command", () => {
  it("joins positional message args", () => {
    expect(joinPromptArgs(["Explain", "this", "workspace"])).toBe("Explain this workspace");
  });
});
