import { expect, test } from "bun:test";
import { isConfirmationAccepted, normalizeRunPrompt } from "./actions.js";

test("normalizeRunPrompt trims and keeps value", () => {
  expect(normalizeRunPrompt("  fix CI  ")).toBe("fix CI");
});

test("normalizeRunPrompt returns undefined for empty", () => {
  expect(normalizeRunPrompt("   ")).toBeUndefined();
});

test("isConfirmationAccepted checks yes case-insensitively", () => {
  expect(isConfirmationAccepted("YeS")).toBe(true);
});

test("isConfirmationAccepted rejects other values", () => {
  expect(isConfirmationAccepted("no")).toBe(false);
});
