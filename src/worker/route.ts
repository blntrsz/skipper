import type { WorkerDefinition, WorkerManifest, WorkerTrigger } from "./contract.js";

export type WorkerRouteContext = {
  provider: "github";
  event: string;
  action?: string;
  repository?: string;
  baseBranch?: string;
  headBranch?: string;
  draft?: boolean;
};

/**
 * Route workers matching incoming event context.
 *
 * @since 1.0.0
 * @category Shared
 */
export function routeWorkers(
  manifest: WorkerManifest,
  context: WorkerRouteContext,
): WorkerDefinition[] {
  const matched: WorkerDefinition[] = [];
  for (const worker of manifest.workers) {
    if (worker.metadata.enabled === false) continue;
    if (matchesWorker(worker, context)) {
      matched.push(worker);
    }
  }
  return matched;
}

/**
 * Check whether worker has at least one matching trigger.
 *
 * @since 1.0.0
 * @category Shared
 */
function matchesWorker(worker: WorkerDefinition, context: WorkerRouteContext): boolean {
  for (const trigger of worker.triggers) {
    if (matchesTrigger(trigger, context)) return true;
  }
  return false;
}

/**
 * Check whether trigger matches context values.
 *
 * @since 1.0.0
 * @category Shared
 */
function matchesTrigger(trigger: WorkerTrigger, context: WorkerRouteContext): boolean {
  if (trigger.provider !== context.provider) return false;
  if (trigger.event !== context.event) return false;
  if (trigger.actions && !matchesAction(trigger.actions, context.action)) return false;
  if (!trigger.if) return true;
  if (!matchesOptionalFilter(trigger.if.repository, context.repository)) return false;
  if (!matchesOptionalFilter(trigger.if.baseBranches, context.baseBranch)) return false;
  if (!matchesOptionalFilter(trigger.if.headBranches, context.headBranch)) return false;
  if (
    trigger.if.draft !== undefined &&
    context.draft !== undefined &&
    trigger.if.draft !== context.draft
  ) {
    return false;
  }
  return true;
}

/**
 * Check action value against trigger actions list.
 *
 * @since 1.0.0
 * @category Shared
 */
function matchesAction(actions: string[], action: string | undefined): boolean {
  if (!action) return false;
  return actions.some((candidate) => candidate === action);
}

/**
 * Match optional string filter list.
 *
 * @since 1.0.0
 * @category Shared
 */
function matchesOptionalFilter(filters: string[] | undefined, value: string | undefined): boolean {
  if (!filters || filters.length === 0) return true;
  if (!value) return false;
  return filters.some((candidate) => candidate === value);
}
