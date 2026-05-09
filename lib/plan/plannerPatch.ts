import type { MobilePlanStateDto } from '@/lib/api/mobilePlan';

/** Sorted unique ids — matches server `normalizeStableIds` semantics for snapshots. */
export function normalizePlannerIdList(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Deterministic optimistic patch: toggle membership of one schedule item id.
 * Updates `stats.plannedItemCount` to match list length (snapshot field).
 */
export function patchMobilePlanSnapshotForItem(
  plan: MobilePlanStateDto | undefined,
  scheduleItemId: string,
  inPlan: boolean,
): MobilePlanStateDto | undefined {
  if (!plan || !Array.isArray(plan.savedScheduleItemIds)) return plan;
  const id = String(scheduleItemId).trim();
  if (!id) return plan;
  const exists = plan.savedScheduleItemIds.includes(id);
  if (exists === inPlan) return plan;

  const nextIds = inPlan
    ? normalizePlannerIdList([id, ...plan.savedScheduleItemIds.filter((x) => x !== id)])
    : normalizePlannerIdList(plan.savedScheduleItemIds.filter((x) => x !== id));

  return {
    ...plan,
    savedScheduleItemIds: nextIds,
    stats: {
      ...plan.stats,
      plannedItemCount: nextIds.length,
    },
  };
}

/**
 * Reconcile snapshot list with server truth for one item after mutation (idempotent).
 */
export function reconcileMobilePlanSnapshotItem(
  plan: MobilePlanStateDto | undefined,
  scheduleItemId: string,
  serverInPlan: boolean,
): MobilePlanStateDto | undefined {
  return patchMobilePlanSnapshotForItem(plan, scheduleItemId, serverInPlan);
}
