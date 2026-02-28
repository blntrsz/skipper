import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverWorkerFiles, loadWorkers } from "./load.js";

test("discoverWorkerFiles scans .skipper dot directory", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "skipper-workers-"));
  try {
    const workerDir = join(rootDir, ".skipper", "worker");
    mkdirSync(workerDir, { recursive: true });
    await Bun.write(
      join(workerDir, "review.ts"),
      [
        "export default {",
        '  metadata: { id: "review", type: "code-review" },',
        '  triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],',
        '  runtime: { prompt: "Review" },',
        "};",
      ].join("\n"),
    );
    await Bun.write(
      join(workerDir, "lint.ts"),
      [
        "export default {",
        '  metadata: { id: "lint", type: "lint" },',
        '  triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],',
        '  runtime: { prompt: "Lint" },',
        "};",
      ].join("\n"),
    );

    const files = await discoverWorkerFiles(rootDir);
    expect(files).toEqual([".skipper/worker/lint.ts", ".skipper/worker/review.ts"]);

    const workers = await loadWorkers(rootDir);
    expect(workers.map((worker) => worker.metadata.id)).toEqual(["lint", "review"]);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
