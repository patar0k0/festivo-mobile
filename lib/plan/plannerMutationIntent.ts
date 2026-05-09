/**
 * Per-entity monotonic intent sequence for planner mutations.
 * Last tap bumps the counter; only the latest sequence may apply server results or roll back optimistic state.
 */

export type PlannerMutationIntentScope = 'festival' | 'schedule' | 'reminder';

const intentCounters = new Map<string, number>();

export function plannerMutationIntentKey(scope: PlannerMutationIntentScope, entityId: string): string {
  return `${scope}:${String(entityId).trim()}`;
}

export function bumpPlannerMutationIntent(scope: PlannerMutationIntentScope, entityId: string): number {
  const key = plannerMutationIntentKey(scope, entityId);
  const next = (intentCounters.get(key) ?? 0) + 1;
  intentCounters.set(key, next);
  return next;
}

export function isLatestPlannerMutationIntent(
  scope: PlannerMutationIntentScope,
  entityId: string,
  seq: number,
): boolean {
  const key = plannerMutationIntentKey(scope, entityId);
  return intentCounters.get(key) === seq;
}
