import {
  isSyntheticPlannerScheduleItemId,
  assertPlannerMutableScheduleItemId,
} from '@/lib/plan/scheduleItemId';

describe('isSyntheticPlannerScheduleItemId', () => {
  it('flags pd- prefixed ids as synthetic', () => {
    expect(isSyntheticPlannerScheduleItemId('pd-123')).toBe(true);
  });

  it('treats server uuids as non-synthetic', () => {
    expect(isSyntheticPlannerScheduleItemId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
});

describe('assertPlannerMutableScheduleItemId', () => {
  it('throws for synthetic ids', () => {
    expect(() => assertPlannerMutableScheduleItemId('pd-9')).toThrow();
  });

  it('does not throw for server ids', () => {
    expect(() => assertPlannerMutableScheduleItemId('abc-123')).not.toThrow();
  });
});
