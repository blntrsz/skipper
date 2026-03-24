/** @effect-diagnostics strictEffectProvide:off */
import { describe, expect, it } from "@effect/vitest";
import {
  buildBranchChoices,
  extractPickedBranch,
  resolvePickedBranch,
} from "../src/command/workspace/workspace.common";

describe("workspace common", () => {
  it("extracts picked branch from worktree folder name", () => {
    expect(extractPickedBranch("skipper", "skipper.testingnewbranching")).toBe(
      "testingnewbranching",
    );
    expect(extractPickedBranch("acme/widgets", "acme/widgets.feat/test")).toBe("feat/test");
    expect(extractPickedBranch("skipper", "testingnewbranching")).toBe("testingnewbranching");
  });

  it("prepends main picker choice", () => {
    expect(buildBranchChoices("skipper", [])).toEqual([
      {
        title: "main",
        value: "__SKIPPER_MAIN__",
      },
    ]);
  });

  it("keeps branch choices and disambiguates real main branch", () => {
    expect(buildBranchChoices("skipper", ["skipper.feature", "skipper.main"])).toEqual([
      {
        title: "main",
        value: "__SKIPPER_MAIN__",
      },
      {
        title: "feature",
        value: "feature",
      },
      {
        title: "main (branch worktree)",
        value: "main",
      },
    ]);
  });

  it("maps synthetic main pick to undefined branch", () => {
    expect(resolvePickedBranch("__SKIPPER_MAIN__")).toBeUndefined();
    expect(resolvePickedBranch("feature")).toBe("feature");
    expect(resolvePickedBranch("main")).toBe("main");
  });
});
