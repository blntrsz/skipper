import type { WorkerDefinition } from "./contract.js";

export type WorkerGithubEventSubscription = {
  workerId: string;
  events: string[];
};

/**
 * Collect unique GitHub webhook events from enabled workers.
 *
 * @since 1.0.0
 * @category Shared
 */
export function collectGithubEventsFromWorkers(workers: WorkerDefinition[]): string[] {
  const events = new Set<string>();
  for (const subscription of collectGithubEventSubscriptions(workers)) {
    for (const event of subscription.events) {
      events.add(event);
    }
  }
  return [...events].sort((left, right) => left.localeCompare(right));
}

/**
 * Collect per-worker GitHub event subscriptions for enabled workers.
 *
 * @since 1.0.0
 * @category Shared
 */
export function collectGithubEventSubscriptions(
  workers: WorkerDefinition[],
): WorkerGithubEventSubscription[] {
  const subscriptions: WorkerGithubEventSubscription[] = [];
  for (const worker of workers) {
    if (worker.metadata.enabled === false) {
      continue;
    }
    const events = new Set<string>();
    for (const trigger of worker.triggers) {
      if (trigger.provider !== "github") {
        continue;
      }
      const event = trigger.event.trim();
      if (event.length > 0) {
        events.add(event);
      }
    }
    if (events.size === 0) {
      continue;
    }
    subscriptions.push({
      workerId: worker.metadata.id,
      events: [...events].sort((left, right) => left.localeCompare(right)),
    });
  }
  return subscriptions.sort((left, right) => left.workerId.localeCompare(right.workerId));
}
