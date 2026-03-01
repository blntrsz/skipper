import { expect, test } from "bun:test";
import { toSqsEvent } from "./eventbridge-handler.js";

test("toSqsEvent keeps detail envelope fields", () => {
  const sqsEvent = toSqsEvent({
    detail: {
      rawBodyB64: "Zm9v",
      headers: {
        "x-github-event": "pull_request",
        "x-github-delivery": "abc",
      },
    },
  });

  expect(sqsEvent.Records).toBeDefined();
  expect(sqsEvent.Records?.length).toBe(1);
  const recordBody = sqsEvent.Records?.[0]?.body;
  expect(recordBody).toBeDefined();
  const parsed = JSON.parse(recordBody ?? "{}") as {
    rawBodyB64?: string;
    headers?: Record<string, string>;
  };
  expect(parsed.rawBodyB64).toBe("Zm9v");
  expect(parsed.headers?.["x-github-event"]).toBe("pull_request");
});

test("toSqsEvent drops invalid detail shape", () => {
  const sqsEvent = toSqsEvent({ detail: 42 });
  const recordBody = sqsEvent.Records?.[0]?.body;
  expect(recordBody).toBeDefined();
  expect(recordBody).toBe("{}");
});
