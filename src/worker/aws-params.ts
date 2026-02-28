export const WORKER_SCHEMA_VERSION = "1";
export const WORKER_CHUNK_COUNT = 12;
export const WORKER_CHUNK_SIZE = 3500;

export const WORKERS_ENCODING_PARAM = "WorkersEncoding";
export const WORKERS_SHA256_PARAM = "WorkersSha256";
export const WORKERS_SCHEMA_VERSION_PARAM = "WorkersSchemaVersion";
export const WORKERS_CHUNK_COUNT_PARAM = "WorkersChunkCount";
export const WORKERS_ENCODING = "gzip-base64-v1";

/**
 * Build worker chunk parameter key from index.
 *
 * @since 1.0.0
 * @category Shared
 */
export function getWorkerChunkParameterKey(index: number): string {
  return `WorkersChunk${index.toString().padStart(2, "0")}`;
}

/**
 * List worker chunk parameter keys.
 *
 * @since 1.0.0
 * @category Shared
 */
export function listWorkerChunkParameterKeys(count = WORKER_CHUNK_COUNT): string[] {
  const keys: string[] = [];
  for (let index = 0; index < count; index += 1) {
    keys.push(getWorkerChunkParameterKey(index));
  }
  return keys;
}

/**
 * Build empty/default worker parameter values.
 *
 * @since 1.0.0
 * @category Shared
 */
export function createDefaultWorkerParameterValues(
  count = WORKER_CHUNK_COUNT,
): Record<string, string> {
  const values: Record<string, string> = {
    [WORKERS_ENCODING_PARAM]: "",
    [WORKERS_SHA256_PARAM]: "",
    [WORKERS_SCHEMA_VERSION_PARAM]: WORKER_SCHEMA_VERSION,
    [WORKERS_CHUNK_COUNT_PARAM]: "0",
  };
  for (const key of listWorkerChunkParameterKeys(count)) {
    values[key] = "";
  }
  return values;
}
