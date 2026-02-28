import { Glob } from "bun";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseWorkerDefinition, type WorkerDefinition } from "./contract.js";

const WORKER_GLOB = new Glob(".skipper/worker/*.ts");

type WorkerModuleExport = {
  default?: unknown;
  metadata?: unknown;
  triggers?: unknown;
  runtime?: unknown;
};

/**
 * Discover and load worker definitions from repository.
 *
 * @since 1.0.0
 * @category Shared
 */
export async function loadWorkers(rootDir: string): Promise<WorkerDefinition[]> {
  const files = await discoverWorkerFiles(rootDir);
  const workers: WorkerDefinition[] = [];
  const seenIds = new Set<string>();
  for (const file of files) {
    const worker = await loadWorkerFile(rootDir, file);
    if (seenIds.has(worker.metadata.id)) {
      throw new Error(`duplicate worker id: ${worker.metadata.id}`);
    }
    seenIds.add(worker.metadata.id);
    workers.push(worker);
  }
  return workers;
}

/**
 * Discover worker file paths from root directory.
 *
 * @since 1.0.0
 * @category Shared
 */
export async function discoverWorkerFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of WORKER_GLOB.scan(rootDir)) {
    files.push(file);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Load and validate one worker module file.
 *
 * @since 1.0.0
 * @category Shared
 */
async function loadWorkerFile(rootDir: string, relativeFile: string): Promise<WorkerDefinition> {
  const absoluteFile = resolve(rootDir, relativeFile);
  const url = pathToFileURL(absoluteFile).href;
  const module = (await import(url)) as WorkerModuleExport;
  const value = readWorkerValue(module);
  return parseWorkerDefinition(value, relativeFile);
}

/**
 * Resolve worker data from module shape.
 *
 * @since 1.0.0
 * @category Shared
 */
function readWorkerValue(module: WorkerModuleExport): unknown {
  if (module.default !== undefined) {
    return module.default;
  }
  if (
    module.metadata !== undefined ||
    module.triggers !== undefined ||
    module.runtime !== undefined
  ) {
    return {
      metadata: module.metadata,
      triggers: module.triggers,
      runtime: module.runtime,
    };
  }
  throw new Error("worker module must export default or metadata/triggers/runtime");
}
