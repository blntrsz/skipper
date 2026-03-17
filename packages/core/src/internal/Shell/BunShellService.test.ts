import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import * as Shell from "./ShellService";
import { BunShellService } from "./BunShellService";

const run = (command: string, options?: { cwd?: string }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const shell = yield* Shell.ShellService;
      return yield* shell.run({ command, cwd: options?.cwd });
    }).pipe(Effect.provide(Layer.effectServices(Effect.succeed(BunShellService)))),
  );

const bool = (command: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const shell = yield* Shell.ShellService;
      return yield* shell.bool({ command, errorMessage: "bool failed" });
    }).pipe(Effect.provide(Layer.effectServices(Effect.succeed(BunShellService)))),
  );

describe("BunShellService.bool", () => {
  test("supports shell builtins with redirects", async () => {
    const result = await bool("command -v sh >/dev/null 2>&1");

    expect(result).toBe(true);
  });

  test("returns false for non-zero exit codes", async () => {
    const result = await bool("exit 7");

    expect(result).toBe(false);
  });
});

describe("BunShellService.run", () => {
  test("returns exact non-zero exit code", async () => {
    const result = await run("exit 7");

    expect(result).toBe(7);
  });

  test("honors cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skipper-bun-shell-"));
    const output = join(cwd, "pwd.txt");

    const result = await run(`pwd > "${output}"`, { cwd });
    const actual = (await readFile(output, "utf8")).trim();

    expect(result).toBe(0);
    expect(actual === cwd || actual === `/private${cwd}`).toBe(true);
  });

  test("maps spawn setup failure to ShellError", async () => {
    await expect(run("pwd", { cwd: "/path/that/does/not/exist" })).rejects.toMatchObject({
      _tag: "ShellError",
    });
  });
});
