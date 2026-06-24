import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import * as mobilePlan from '@/lib/api/mobilePlan';
import type { MobilePlanStateDto } from '@/lib/api/mobilePlan';
import {
  enqueueFestivalPlanMutation,
  replayQueuedPlannerMutations,
  hydrateQueuedPlannerMutations,
} from '@/lib/plan/offlineQueue';

jest.mock('@/lib/api/mobilePlan', () => ({
  getMobilePlanState: jest.fn(),
  saveFestivalToPlan: jest.fn(),
  removeFestivalFromPlan: jest.fn(),
  setScheduleItemInPlan: jest.fn(),
  updateFestivalReminder: jest.fn(),
}));

const mocked = mobilePlan as jest.Mocked<typeof mobilePlan>;

function emptyServerState(over: Partial<MobilePlanStateDto> = {}): MobilePlanStateDto {
  return {
    savedFestivalIds: [],
    savedFestivals: [],
    savedScheduleItemIds: [],
    reminders: {},
    stats: { savedFestivalCount: 0, plannedItemCount: 0, upcomingCount: 0 },
    updated_at: '2026-06-24T00:00:00.000Z',
    ...over,
  };
}

function fakeQueryClient() {
  const store: Record<string, unknown> = {};
  return {
    setQueryData: jest.fn((key: unknown, updater: unknown) => {
      const k = JSON.stringify(key);
      store[k] = typeof updater === 'function' ? (updater as (c: unknown) => unknown)(store[k]) : updater;
      return store[k];
    }),
    invalidateQueries: jest.fn(),
    getData: (key: unknown) => store[JSON.stringify(key)],
  } as unknown as QueryClient & { getData: (key: unknown) => unknown };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('replayQueuedPlannerMutations', () => {
  it('saves a queued festival the server does not yet have, then clears the queue', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState
      .mockResolvedValueOnce(emptyServerState()) // initial server snapshot
      .mockResolvedValueOnce(emptyServerState({ savedFestivalIds: ['F1'] })); // post-replay refresh
    mocked.saveFestivalToPlan.mockResolvedValue(
      emptyServerState({ savedFestivalIds: ['F1'] }) as never,
    );

    const qc = fakeQueryClient();
    await replayQueuedPlannerMutations(qc);

    expect(mocked.saveFestivalToPlan).toHaveBeenCalledWith('F1');
    const raw = await AsyncStorage.getItem('festivo.plannerMutationQueue.v2');
    expect(JSON.parse(raw ?? '[]')).toHaveLength(0);
  });

  it('idempotently skips a mutation the server already satisfies', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState.mockResolvedValue(emptyServerState({ savedFestivalIds: ['F1'] }));

    await replayQueuedPlannerMutations(fakeQueryClient());

    expect(mocked.saveFestivalToPlan).not.toHaveBeenCalled();
  });

  it('keeps an item queued when its replay call fails', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState.mockResolvedValue(emptyServerState());
    mocked.saveFestivalToPlan.mockRejectedValue(new Error('Network request failed'));

    await replayQueuedPlannerMutations(fakeQueryClient());

    const raw = await AsyncStorage.getItem('festivo.plannerMutationQueue.v2');
    expect(JSON.parse(raw ?? '[]')).toHaveLength(1);
  });
});

describe('hydrateQueuedPlannerMutations', () => {
  it('applies queued intent onto cached plan state', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    const qc = fakeQueryClient();
    qc.setQueryData(['mobilePlanState'], emptyServerState());

    await hydrateQueuedPlannerMutations(qc);

    const next = (qc as unknown as { getData: (k: unknown) => MobilePlanStateDto }).getData([
      'mobilePlanState',
    ]);
    expect(next.savedFestivalIds).toContain('F1');
  });
});
