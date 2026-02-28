import { expect, test } from "bun:test";
import { classifyStackStatus } from "./cloudformation.js";

test("classifyStackStatus", () => {
  expect(classifyStackStatus("CREATE_COMPLETE")).toBe("success");
  expect(classifyStackStatus("UPDATE_COMPLETE")).toBe("success");
  expect(classifyStackStatus("UPDATE_ROLLBACK_COMPLETE")).toBe("failure");
  expect(classifyStackStatus("CREATE_IN_PROGRESS")).toBe("in-progress");
});
