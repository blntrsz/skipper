import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import * as RepositoryPath from "./RepositoryPath";

describe("RepositoryPath.make", () => {
  test("builds path from repository name", () => {
    expect(String(RepositoryPath.make("skipper"))).toBe(
      join(homedir(), ".local/share/github", "skipper")
    );
  });

  test("throws on non-string input", () => {
    expect(() =>
      RepositoryPath.make({ repository: "skipper" } as never)
    ).toThrow("RepositoryPath.make expected repository string");
  });
});
