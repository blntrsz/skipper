/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import { extractPickedBranch } from "../src/command/workspace/workspace.common";

describe("cli dry-run", () => {
  it("extracts picked branch from worktree folder name", () => {
    expect(extractPickedBranch("skipper", "skipper.testingnewbranching")).toBe(
      "testingnewbranching",
    );
    expect(extractPickedBranch("acme/widgets", "acme/widgets.feat/test")).toBe("feat/test");
    expect(extractPickedBranch("skipper", "testingnewbranching")).toBe("testingnewbranching");
  });
});
