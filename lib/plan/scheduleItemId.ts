/**
 * Draft / placeholder schedule rows must never hit `/api/plan/items`.
 * Server UUIDs only; synthetic ids are local-visual only.
 */
export function isSyntheticPlannerScheduleItemId(scheduleItemId: string): boolean {
  return scheduleItemId.startsWith('pd-');
}

export function assertPlannerMutableScheduleItemId(scheduleItemId: string): void {
  if (isSyntheticPlannerScheduleItemId(scheduleItemId)) {
    throw new Error('Synthetic schedule items cannot be synced to the server.');
  }
}
