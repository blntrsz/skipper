import type { WorkerDefinition } from "./contract.js";

/**
 * Collect unique GitHub webhook events from enabled workers.
 *
 * @since 1.0.0
 * @category Shared
 */
export function collectGithubEventsFromWorkers(workers: WorkerDefinition[]): string[] {
  const events = new Set<string>();
  for (const worker of workers) {
    if (worker.metadata.enabled === false) {
      continue;
    }
    for (const trigger of worker.triggers) {
      if (trigger.provider !== "github") {
        continue;
      }
      const event = trigger.event.trim();
      if (event.length > 0) {
        events.add(event);
      }
    }
  }
  return [...events].sort((left, right) => left.localeCompare(right));
}
