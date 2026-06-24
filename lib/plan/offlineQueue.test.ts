import {
  compactPlannerQueueForPersistence,
  orderQueueForReplay,
  isLikelyOfflinePlannerError,
  type QueuedPlannerMutation,
} from '@/lib/plan/offlineQueue';

function festival(id: string, desiredSaved: boolean, createdAt: string): QueuedPlannerMutation {
  return { id: `f:${id}:${createdAt}`, kind: 'festival', festivalId: id, desiredSaved, createdAt };
}
function schedule(id: string, desiredInPlan: boolean, createdAt: string): QueuedPlannerMutation {
  return { id: `s:${id}:${createdAt}`, kind: 'scheduleItem', scheduleItemId: id, desiredInPlan, createdAt };
}
function reminder(id: string, createdAt: string): QueuedPlannerMutation {
  return { id: `r:${id}:${createdAt}`, kind: 'reminder', festivalId: id, reminderType: '24h', createdAt };
}

const T0 = '2026-06-24T10:00:00.000Z';
const T1 = '2026-06-24T10:00:01.000Z';

describe('compactPlannerQueueForPersistence', () => {
  it('keeps only the last intent per festival key', () => {
    const out = compactPlannerQueueForPersistence([
      festival('A', true, T0),
      festival('A', false, T1),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ festivalId: 'A', desiredSaved: false });
  });

  it('drops items older than the max age window', () => {
    const ancient = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const out = compactPlannerQueueForPersistence([festival('A', true, ancient)]);
    expect(out).toHaveLength(0);
  });

  it('drops items with unparseable createdAt', () => {
    const out = compactPlannerQueueForPersistence([festival('A', true, 'nope')]);
    expect(out).toHaveLength(0);
  });

  it('orders survivors by createdAt ascending', () => {
    const out = compactPlannerQueueForPersistence([
      festival('B', true, T1),
      festival('A', true, T0),
    ]);
    expect(out.map((i) => (i.kind === 'festival' ? i.festivalId : ''))).toEqual(['A', 'B']);
  });
});

describe('orderQueueForReplay', () => {
  it('orders festivals before schedule items before reminders', () => {
    const out = orderQueueForReplay([
      reminder('A', T0),
      schedule('s1', true, T1),
      festival('A', true, T0),
    ]);
    expect(out.map((i) => i.kind)).toEqual(['festival', 'scheduleItem', 'reminder']);
  });
});

describe('isLikelyOfflinePlannerError', () => {
  it('detects network failure messages', () => {
    expect(isLikelyOfflinePlannerError(new Error('Network request failed'))).toBe(true);
    expect(isLikelyOfflinePlannerError(new Error('Failed to fetch'))).toBe(true);
  });

  it('returns false for unrelated errors and nullish', () => {
    expect(isLikelyOfflinePlannerError(new Error('500 server error'))).toBe(false);
    expect(isLikelyOfflinePlannerError(null)).toBe(false);
  });
});
