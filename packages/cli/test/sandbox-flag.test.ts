import { describe, expect, it } from "@effect/vitest";
import { resolveSandboxFromArgv } from "../src/common/global-flags.ts";

describe("sandbox flag", () => {
  it("defaults to worktree", () => {
    expect(resolveSandboxFromArgv([])).toBe("worktree");
  });

  it("detects explicit docker flag", () => {
    expect(resolveSandboxFromArgv(["workspace", "run", "--sandbox", "docker"])).toBe("docker");
    expect(resolveSandboxFromArgv(["--sandbox=docker", "workspace", "run"])).toBe("docker");
  });

  it("falls back to worktree for invalid values", () => {
    expect(resolveSandboxFromArgv(["--sandbox", "invalid"])).toBe("worktree");
  });
});
