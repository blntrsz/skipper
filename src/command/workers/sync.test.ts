import { expect, test } from "bun:test";
import { mergeWorkerParameters } from "./sync.js";

test("mergeWorkerParameters updates worker keys and preserves others", () => {
  const merged = mergeWorkerParameters(
    [
      { ParameterKey: "Prompt", ParameterValue: "old" },
      { ParameterKey: "WorkersSha256", ParameterValue: "old-sha" },
      { ParameterKey: "WorkersChunk00", ParameterValue: "old-chunk" },
    ],
    {
      WorkersSha256: "new-sha",
      WorkersChunk00: "new-chunk",
      WorkersChunkCount: "1",
    },
  );
  expect(merged).toContainEqual({ ParameterKey: "Prompt", UsePreviousValue: true });
  expect(merged).toContainEqual({ ParameterKey: "WorkersSha256", ParameterValue: "new-sha" });
  expect(merged).toContainEqual({ ParameterKey: "WorkersChunk00", ParameterValue: "new-chunk" });
  expect(merged).toContainEqual({ ParameterKey: "WorkersChunkCount", ParameterValue: "1" });
});
