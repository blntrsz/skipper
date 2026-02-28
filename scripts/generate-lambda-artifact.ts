import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const entrypoint = join(rootDir, "src/command/aws/lambda/handler.ts");
const outFile = join(rootDir, "src/command/aws/lambda-artifact.generated.ts");
const tempDir = mkdtempSync(join(tmpdir(), "skipper-lambda-"));
const bundledPath = join(tempDir, "index.js");

const buildProc = Bun.spawnSync([
  "bun",
  "build",
  entrypoint,
  "--target",
  "node",
  "--format",
  "cjs",
  "--minify",
  "--outfile",
  bundledPath,
]);

if (buildProc.exitCode !== 0) {
  throw new Error("failed to bundle lambda handler");
}

const bundledCode = await Bun.file(bundledPath).text();
const zipped = zipSync({ "index.js": strToU8(bundledCode) }, { level: 9 });
const bytes = new Uint8Array(zipped);
const base64 = Buffer.from(bytes).toString("base64");
const sha256 = createHash("sha256").update(bytes).digest("hex");

const contents = [
  "export const LAMBDA_ZIP_BASE64 =",
  `  ${JSON.stringify(base64)};`,
  `export const LAMBDA_ZIP_SHA256 = ${JSON.stringify(sha256)};`,
].join("\n");

await Bun.write(outFile, `${contents}\n`);
rmSync(tempDir, { recursive: true, force: true });
console.log(`generated ${outFile}`);
