import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  createDefaultWorkerParameterValues,
  listWorkerChunkParameterKeys,
  WORKER_CHUNK_COUNT,
  WORKER_CHUNK_SIZE,
  WORKERS_CHUNK_COUNT_PARAM,
  WORKERS_ENCODING,
  WORKERS_ENCODING_PARAM,
  WORKER_SCHEMA_VERSION,
  WORKERS_SCHEMA_VERSION_PARAM,
  WORKERS_SHA256_PARAM,
} from "./aws-params.js";
import { parseUnknownJson } from "../shared/validation/parse-json.js";
import { parseWorkerDefinition, type WorkerManifest } from "./contract.js";

export type SerializedWorkers = {
  parameterValues: Record<string, string>;
  byteLength: number;
  workerCount: number;
};

/**
 * Build worker parameter values from manifest.
 *
 * @since 1.0.0
 * @category Shared
 */
export function encodeWorkerManifest(manifest: WorkerManifest): SerializedWorkers {
  if (manifest.workers.length === 0) {
    return {
      parameterValues: createDefaultWorkerParameterValues(),
      byteLength: 0,
      workerCount: 0,
    };
  }
  const serializedJson = JSON.stringify(manifest);
  const compressed = gzipSync(Buffer.from(serializedJson, "utf8"));
  const encoded = compressed.toString("base64");
  const chunks = chunkValue(encoded, WORKER_CHUNK_SIZE);
  if (chunks.length > WORKER_CHUNK_COUNT) {
    throw new Error(`worker manifest too large: ${chunks.length} chunks > ${WORKER_CHUNK_COUNT}`);
  }
  const parameterValues = createDefaultWorkerParameterValues();
  parameterValues[WORKERS_ENCODING_PARAM] = WORKERS_ENCODING;
  parameterValues[WORKERS_SCHEMA_VERSION_PARAM] = WORKER_SCHEMA_VERSION;
  parameterValues[WORKERS_SHA256_PARAM] = sha256Hex(serializedJson);
  parameterValues[WORKERS_CHUNK_COUNT_PARAM] = String(chunks.length);

  const keys = listWorkerChunkParameterKeys();
  for (let index = 0; index < chunks.length; index += 1) {
    const key = keys[index];
    const chunk = chunks[index];
    if (!key) {
      throw new Error(`missing worker chunk key for index ${index}`);
    }
    if (chunk === undefined) {
      throw new Error(`missing worker chunk for index ${index}`);
    }
    parameterValues[key] = chunk;
  }
  return {
    parameterValues,
    byteLength: serializedJson.length,
    workerCount: manifest.workers.length,
  };
}

/**
 * Read worker manifest from CloudFormation parameter values.
 *
 * @since 1.0.0
 * @category Shared
 */
export function decodeWorkerManifest(
  parameterValues: Record<string, string | undefined>,
): WorkerManifest | undefined {
  const chunkCount = readChunkCount(parameterValues[WORKERS_CHUNK_COUNT_PARAM]);
  const sha = parameterValues[WORKERS_SHA256_PARAM]?.trim() ?? "";
  if (chunkCount === 0 || sha.length === 0) {
    return undefined;
  }
  const encoding = parameterValues[WORKERS_ENCODING_PARAM]?.trim();
  if (encoding !== WORKERS_ENCODING) {
    throw new Error(`unsupported workers encoding: ${encoding ?? ""}`);
  }
  const schemaVersion = parameterValues[WORKERS_SCHEMA_VERSION_PARAM]?.trim();
  if (schemaVersion !== WORKER_SCHEMA_VERSION) {
    throw new Error(`unsupported workers schema version: ${schemaVersion ?? ""}`);
  }
  const keys = listWorkerChunkParameterKeys();
  const encoded = keys
    .slice(0, chunkCount)
    .map((key) => parameterValues[key]?.trim() ?? "")
    .join("");
  if (encoded.length === 0) {
    throw new Error("worker chunks missing");
  }
  const compressed = Buffer.from(encoded, "base64");
  const json = gunzipSync(compressed).toString("utf8");
  const parsed = parseWorkerManifestJson(json);
  const actualSha = sha256Hex(json);
  if (actualSha !== sha) {
    throw new Error("worker manifest checksum mismatch");
  }
  return parsed;
}

/**
 * Parse serialized worker manifest JSON.
 *
 * @since 1.0.0
 * @category Shared
 */
function parseWorkerManifestJson(value: string): WorkerManifest {
  const parsed = parseUnknownJson(value, "worker manifest");
  if (!isRecord(parsed) || !Array.isArray(parsed.workers)) {
    throw new Error("invalid worker manifest");
  }
  return {
    workers: parsed.workers.map((worker, index) =>
      parseWorkerDefinition(worker, `manifest worker[${index}]`),
    ),
  };
}

/**
 * Build sha256 hash as hex.
 *
 * @since 1.0.0
 * @category Shared
 */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Split string into fixed-size chunks.
 *
 * @since 1.0.0
 * @category Shared
 */
function chunkValue(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * Parse worker chunk count value.
 *
 * @since 1.0.0
 * @category Shared
 */
function readChunkCount(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > WORKER_CHUNK_COUNT) {
    throw new Error("invalid worker chunk count");
  }
  return parsed;
}

/**
 * Check plain object shape.
 *
 * @since 1.0.0
 * @category Shared
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
