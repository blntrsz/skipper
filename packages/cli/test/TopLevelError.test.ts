import { describe, expect, it } from "vitest";
import { toTopLevelErrorMessage } from "../src/TopLevelError";

describe("toTopLevelErrorMessage", () => {
  it("returns message field when present", () => {
    expect(toTopLevelErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to generic text", () => {
    expect(toTopLevelErrorMessage(undefined)).toBe("Unknown error");
  });
});
