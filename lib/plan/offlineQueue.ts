import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import {
  getMobilePlanState,
  removeFestivalFromPlan,
  saveFestivalToPlan,
  toggleScheduleItemInPlan,
  type MobilePlanStateDto,
} from '@/lib/api/mobilePlan';

const STORAGE_KEY = 'festivo.plannerMutationQueue.v1';
const MAX_QUEUE_SIZE = 80;

export type QueuedPlannerMutation =
  | {
      id: string;
      kind: 'festival';
      festivalId: string;
      desiredSaved: boolean;
      createdAt: string;
    }
  | {
      id: string;
      kind: 'scheduleItem';
      scheduleItemId: string;
      desiredInPlan: boolean;
      createdAt: string;
    };

let replayPromise: Promise<void> | null = null;

function nowId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function parseQueue(raw: string | null): QueuedPlannerMutation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedPlannerMutation => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Partial<QueuedPlannerMutation>;
      return typeof row.id === 'string' && (row.kind === 'festival' || row.kind === 'scheduleItem');
    });
  } catch {
    return [];
  }
}

async function readQueue(): Promise<QueuedPlannerMutation[]> {
  return parseQueue(await AsyncStorage.getItem(STORAGE_KEY));
}

async function writeQueue(queue: QueuedPlannerMutation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
}

export function isLikelyOfflinePlannerError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|networkerror|internet|offline/i.test(message);
}

export async function enqueueFestivalPlanMutation(festivalId: string, desiredSaved: boolean) {
  const current = await readQueue();
  const next = current.filter((item) => !(item.kind === 'festival' && item.festivalId === festivalId));
  next.push({
    id: nowId('festival'),
    kind: 'festival',
    festivalId,
    desiredSaved,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(next);
}

export async function enqueueScheduleItemPlanMutation(scheduleItemId: string, desiredInPlan: boolean) {
  const current = await readQueue();
  const next = current.filter(
    (item) => !(item.kind === 'scheduleItem' && item.scheduleItemId === scheduleItemId),
  );
  next.push({
    id: nowId('schedule'),
    kind: 'scheduleItem',
    scheduleItemId,
    desiredInPlan,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(next);
}

function patchPlanStateFromQueue(
  state: MobilePlanStateDto | undefined,
  queue: QueuedPlannerMutation[],
): MobilePlanStateDto | undefined {
  if (!state) return state;
  let savedFestivalIds = state.savedFestivalIds;
  let savedScheduleItemIds = state.savedScheduleItemIds;

  for (const item of queue) {
    if (item.kind === 'festival') {
      savedFestivalIds = item.desiredSaved
        ? [item.festivalId, ...savedFestivalIds.filter((id) => id !== item.festivalId)]
        : savedFestivalIds.filter((id) => id !== item.festivalId);
    } else {
      savedScheduleItemIds = item.desiredInPlan
        ? [item.scheduleItemId, ...savedScheduleItemIds.filter((id) => id !== item.scheduleItemId)]
        : savedScheduleItemIds.filter((id) => id !== item.scheduleItemId);
    }
  }

  return {
    ...state,
    savedFestivalIds,
    savedScheduleItemIds,
    stats: {
      ...state.stats,
      savedFestivalCount: savedFestivalIds.length,
      plannedItemCount: savedScheduleItemIds.length,
    },
  };
}

export async function hydrateQueuedPlannerMutations(queryClient: QueryClient): Promise<void> {
  const queue = await readQueue();
  if (!queue.length) return;
  queryClient.setQueryData<MobilePlanStateDto>(['mobilePlanState'], (current) =>
    patchPlanStateFromQueue(current, queue),
  );
}

export async function replayQueuedPlannerMutations(queryClient: QueryClient): Promise<void> {
  if (replayPromise) return replayPromise;

  replayPromise = (async () => {
    const queue = await readQueue();
    if (!queue.length) return;

    let serverState: MobilePlanStateDto;
    try {
      serverState = await getMobilePlanState();
    } catch {
      return;
    }

    const remaining: QueuedPlannerMutation[] = [];

    for (const item of queue) {
      try {
        if (item.kind === 'festival') {
          const hasFestival = serverState.savedFestivalIds.includes(item.festivalId);
          if (hasFestival !== item.desiredSaved) {
            if (item.desiredSaved) {
              await saveFestivalToPlan(item.festivalId);
            } else {
              await removeFestivalFromPlan(item.festivalId);
            }
          }
        } else {
          const hasItem = serverState.savedScheduleItemIds.includes(item.scheduleItemId);
          if (hasItem !== item.desiredInPlan) {
            await toggleScheduleItemInPlan(item.scheduleItemId);
          }
        }
        serverState = await getMobilePlanState();
      } catch {
        remaining.push(item);
      }
    }

    await writeQueue(remaining);
    queryClient.setQueryData(['mobilePlanState'], serverState);
    queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
  })().finally(() => {
    replayPromise = null;
  });

  return replayPromise;
}
