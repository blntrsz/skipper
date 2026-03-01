import { expect, test } from "bun:test";
import { buildGreeting } from "./hello.js";

test("buildGreeting returns default greeting without name", () => {
  expect(buildGreeting()).toBe("Hello World!");
});

test("buildGreeting returns personalised greeting with name", () => {
  expect(buildGreeting("Alice")).toBe("Hello Alice!");
});
