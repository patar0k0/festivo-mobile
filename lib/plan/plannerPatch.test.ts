import {
  normalizePlannerIdList,
  patchMobilePlanSnapshotForItem,
} from '@/lib/plan/plannerPatch';
import type { MobilePlanStateDto } from '@/lib/api/mobilePlan';

function makePlan(scheduleIds: string[]): MobilePlanStateDto {
  return {
    savedFestivalIds: [],
    savedFestivals: [],
    savedScheduleItemIds: scheduleIds,
    reminders: {},
    stats: { savedFestivalCount: 0, plannedItemCount: scheduleIds.length, upcomingCount: 0 },
    updated_at: '2026-06-24T00:00:00.000Z',
  };
}

describe('normalizePlannerIdList', () => {
  it('dedupes, trims, drops empties and sorts', () => {
    expect(normalizePlannerIdList([' b ', 'a', 'a', ''])).toEqual(['a', 'b']);
  });
});

describe('patchMobilePlanSnapshotForItem', () => {
  it('adds an item and bumps plannedItemCount', () => {
    const next = patchMobilePlanSnapshotForItem(makePlan(['a']), 'b', true)!;
    expect(next.savedScheduleItemIds).toEqual(['a', 'b']);
    expect(next.stats.plannedItemCount).toBe(2);
  });

  it('removes an item and lowers plannedItemCount', () => {
    const next = patchMobilePlanSnapshotForItem(makePlan(['a', 'b']), 'b', false)!;
    expect(next.savedScheduleItemIds).toEqual(['a']);
    expect(next.stats.plannedItemCount).toBe(1);
  });

  it('is a no-op when desired state already matches (returns same ref)', () => {
    const plan = makePlan(['a']);
    expect(patchMobilePlanSnapshotForItem(plan, 'a', true)).toBe(plan);
  });

  it('returns plan unchanged for empty id', () => {
    const plan = makePlan(['a']);
    expect(patchMobilePlanSnapshotForItem(plan, '   ', true)).toBe(plan);
  });

  it('returns undefined plan as-is', () => {
    expect(patchMobilePlanSnapshotForItem(undefined, 'a', true)).toBeUndefined();
  });
});
