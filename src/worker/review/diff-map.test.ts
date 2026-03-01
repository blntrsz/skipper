import { expect, test } from "bun:test";
import {
  buildChangedLineIndex,
  collectRightSideLines,
  decodePullRequestFiles,
  mapFindingsToChangedLines,
} from "./diff-map.js";

test("collectRightSideLines captures added lines only", () => {
  const lines = collectRightSideLines([
    "@@ -10,2 +10,3 @@",
    " context",
    "-old",
    "+new",
    "+another",
  ].join("\n"));
  expect([...lines]).toEqual([11, 12]);
});

test("decodePullRequestFiles handles slurped paginated response", () => {
  const files = decodePullRequestFiles(
    JSON.stringify([
      [
        {
          filename: "src/a.ts",
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ],
      [
        {
          filename: "src/b.ts",
          patch: "@@ -2 +2 @@\n-old\n+new",
        },
      ],
    ]),
  );
  expect(files.map((file) => file.filename)).toEqual(["src/a.ts", "src/b.ts"]);
});

test("mapFindingsToChangedLines skips unmappable findings", () => {
  const lineIndex = buildChangedLineIndex([
    {
      filename: "src/a.ts",
      patch: "@@ -1 +1,2 @@\n-old\n+new\n+again",
    },
  ]);
  const result = mapFindingsToChangedLines(
    [
      {
        severity: "major",
        path: "src/a.ts",
        line: 2,
        title: "mapped",
        body: "ok",
      },
      {
        severity: "minor",
        path: "src/a.ts",
        line: 99,
        title: "not-mapped",
        body: "skip",
      },
    ],
    lineIndex,
  );

  expect(result.mapped.length).toBe(1);
  expect(result.unmapped.length).toBe(1);
  const firstUnmapped = result.unmapped[0];
  expect(firstUnmapped).toBeDefined();
  if (!firstUnmapped) {
    return;
  }
  expect(firstUnmapped.reason).toContain("line not changed");
});
