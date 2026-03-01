import { expect, test } from "bun:test";
import {
  extractFirstJsonObject,
  parseInlineReviewPayload,
  MAX_INLINE_BODY_LENGTH,
  MAX_INLINE_TITLE_LENGTH,
} from "./inline-contract.js";

test("parseInlineReviewPayload validates and clamps finding strings", () => {
  const title = "x".repeat(MAX_INLINE_TITLE_LENGTH + 50);
  const body = "y".repeat(MAX_INLINE_BODY_LENGTH + 50);
  const parsed = parseInlineReviewPayload(
    JSON.stringify({
      version: 1,
      findings: [
        {
          severity: "major",
          path: "src/app.ts",
          line: 10,
          title,
          body,
        },
      ],
    }),
  );

  expect(parsed.version).toBe(1);
  expect(parsed.findings.length).toBe(1);
  const firstFinding = parsed.findings[0];
  expect(firstFinding).toBeDefined();
  if (!firstFinding) {
    return;
  }
  expect(firstFinding.title.length).toBeLessThanOrEqual(MAX_INLINE_TITLE_LENGTH);
  expect(firstFinding.body.length).toBeLessThanOrEqual(MAX_INLINE_BODY_LENGTH);
});

test("extractFirstJsonObject pulls JSON from mixed output", () => {
  const raw = "log line\n{\"version\":1,\"findings\":[]}\ntrailer";
  expect(extractFirstJsonObject(raw)).toBe('{"version":1,"findings":[]}');
});

test("parseInlineReviewPayload rejects bad severity", () => {
  expect(() =>
    parseInlineReviewPayload(
      JSON.stringify({
        version: 1,
        findings: [
          {
            severity: "low",
            path: "src/app.ts",
            line: 10,
            title: "t",
            body: "b",
          },
        ],
      }),
    ),
  ).toThrow("severity");
});
