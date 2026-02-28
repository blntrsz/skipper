import { Glob } from "bun";

const SRC_GLOB = new Glob("src/**/*.ts");

type Issue = {
  file: string;
  message: string;
};

/**
 * Validate source standards for docs and unsafe casts.
 *
 * @since 1.0.0
 * @category Shared
 */
async function main(): Promise<void> {
  const files = await collectSourceFiles();
  const issues: Issue[] = [];
  for (const file of files) {
    const source = await Bun.file(file).text();
    issues.push(...validateSource(file, source));
  }
  if (issues.length === 0) {
    console.log("source standards: ok");
    return;
  }
  for (const issue of issues) {
    console.error(`${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

/**
 * Collect production source files.
 *
 * @since 1.0.0
 * @category Shared
 */
async function collectSourceFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const file of SRC_GLOB.scan(".")) {
    if (file.endsWith(".test.ts")) continue;
    if (file.endsWith(".generated.ts")) continue;
    files.push(file);
  }
  return files;
}

/**
 * Validate one source file.
 *
 * @since 1.0.0
 * @category Shared
 */
function validateSource(file: string, source: string): Issue[] {
  const issues: Issue[] = [];
  if (/JSON\.parse\([^)]*\)\s+as\s+/m.test(source)) {
    issues.push({ message: "contains unsafe JSON.parse cast", file });
  }
  const fnPositions = findFunctionPositions(source);
  for (const index of fnPositions) {
    const jsdoc = readClosestJsdoc(source, index);
    if (!jsdoc) {
      issues.push({ message: "missing JSDoc on function", file });
      continue;
    }
    if (!/\n\s*\*\s*\n\s*\*\s*@since\s+\d+\.\d+\.\d+/m.test(jsdoc)) {
      issues.push({ message: "missing blank line + @since semver", file });
    }
    if (!/\n\s*\*\s*@category\s+\S+/m.test(jsdoc)) {
      issues.push({ message: "missing @category", file });
    }
  }
  return issues;
}

/**
 * Find function-like declaration positions.
 *
 * @since 1.0.0
 * @category Shared
 */
function findFunctionPositions(source: string): number[] {
  const positions: number[] = [];
  const regexes = [
    /(?:^|\n)\s*export\s+async\s+function\s+\w+/g,
    /(?:^|\n)\s*export\s+function\s+\w+/g,
    /(?:^|\n)\s*async\s+function\s+\w+/g,
    /(?:^|\n)\s*function\s+\w+/g,
  ];
  for (const regex of regexes) {
    for (const match of source.matchAll(regex)) {
      if (match.index !== undefined) {
        positions.push(match.index);
      }
    }
  }
  return positions.sort((a, b) => a - b);
}

/**
 * Read nearest JSDoc block before function.
 *
 * @since 1.0.0
 * @category Shared
 */
function readClosestJsdoc(source: string, position: number): string | undefined {
  const before = source.slice(0, position);
  const end = before.lastIndexOf("*/");
  if (end === -1) return undefined;
  const start = before.lastIndexOf("/**", end);
  if (start === -1) return undefined;
  const between = before.slice(end + 2).trim();
  if (between.length > 0) return undefined;
  return before.slice(start, end + 2);
}

await main();
