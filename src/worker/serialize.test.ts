import { expect, test } from "bun:test";
import { WORKERS_SHA256_PARAM } from "./aws-params.js";
import { decodeWorkerManifest, encodeWorkerManifest } from "./serialize.js";

test("encode/decode roundtrip worker manifest", () => {
  const encoded = encodeWorkerManifest({
    workers: [
      {
        metadata: { id: "review", type: "code-review", enabled: true },
        triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
        runtime: { mode: "comment-only", allowPush: false, prompt: "Review only" },
      },
    ],
  });
  const decoded = decodeWorkerManifest(encoded.parameterValues);
  expect(decoded).toBeDefined();
  expect(decoded?.workers[0]?.metadata.id).toBe("review");
});

test("decode validates checksum", () => {
  const encoded = encodeWorkerManifest({
    workers: [
      {
        metadata: { id: "review", type: "code-review", enabled: true },
        triggers: [{ provider: "github", event: "pull_request", actions: ["opened"] }],
        runtime: { mode: "comment-only", allowPush: false, prompt: "Review only" },
      },
    ],
  });
  const tampered = {
    ...encoded.parameterValues,
    [WORKERS_SHA256_PARAM]: "bad",
  };
  expect(() => decodeWorkerManifest(tampered)).toThrow("checksum");
});

test("encode empty workers clears payload", () => {
  const encoded = encodeWorkerManifest({ workers: [] });
  const decoded = decodeWorkerManifest(encoded.parameterValues);
  expect(encoded.workerCount).toBe(0);
  expect(decoded).toBeUndefined();
});
