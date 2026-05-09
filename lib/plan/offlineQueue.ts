import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import {
  getMobilePlanState,
  removeFestivalFromPlan,
  saveFestivalToPlan,
  toggleScheduleItemInPlan,
  updateFestivalReminder,
  type MobilePlanReminderType,
  type MobilePlanStateDto,
} from '@/lib/api/mobilePlan';
import { isSyntheticPlannerScheduleItemId } from '@/lib/plan/scheduleItemId';

const STORAGE_KEY_V1 = 'festivo.plannerMutationQueue.v1';
const STORAGE_KEY_V2 = 'festivo.plannerMutationQueue.v2';
const MAX_QUEUE_SIZE = 80;
/** Drop queued mutations older than this so replay cannot resurrect ancient intent after reinstall/long offline. */
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
    }
  | {
      id: string;
      kind: 'reminder';
      festivalId: string;
      reminderType: MobilePlanReminderType;
      createdAt: string;
    };

let replayPromise: Promise<void> | null = null;

function nowId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function parseReminderType(raw: unknown): MobilePlanReminderType {
  if (raw === 'none' || raw === '24h' || raw === 'same_day_09' || raw === 'default') return raw;
  return 'default';
}

function isQueuedItem(row: Partial<QueuedPlannerMutation>): row is QueuedPlannerMutation {
  if (!row || typeof row.id !== 'string' || typeof row.createdAt !== 'string') return false;
  if (row.kind === 'festival') {
    return typeof row.festivalId === 'string' && typeof row.desiredSaved === 'boolean';
  }
  if (row.kind === 'scheduleItem') {
    return typeof row.scheduleItemId === 'string' && typeof row.desiredInPlan === 'boolean';
  }
  if (row.kind === 'reminder') {
    return typeof row.festivalId === 'string' && typeof row.reminderType === 'string';
  }
  return false;
}

function parseQueueJson(raw: string | null): QueuedPlannerMutation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedPlannerMutation => {
      if (!item || typeof item !== 'object') return false;
      return isQueuedItem(item as Partial<QueuedPlannerMutation>);
    });
  } catch {
    return [];
  }
}

function queueDedupeKey(item: QueuedPlannerMutation): string {
  if (item.kind === 'festival') return `festival:${item.festivalId}`;
  if (item.kind === 'scheduleItem') return `schedule:${item.scheduleItemId}`;
  return `reminder:${item.festivalId}`;
}

/** Last intent per key wins; stale timestamps dropped; deterministic createdAt ordering. */
export function compactPlannerQueueForPersistence(items: QueuedPlannerMutation[]): QueuedPlannerMutation[] {
  const now = Date.now();
  const fresh: QueuedPlannerMutation[] = [];
  for (const item of items) {
    const t = Date.parse(item.createdAt);
    if (!Number.isFinite(t) || now - t > MAX_ITEM_AGE_MS) continue;
    fresh.push(item);
  }
  fresh.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const byKey = new Map<string, QueuedPlannerMutation>();
  for (const item of fresh) {
    const row =
      item.kind === 'reminder'
        ? { ...item, reminderType: parseReminderType(item.reminderType) }
        : item;
    byKey.set(queueDedupeKey(row), row);
  }
  return [...byKey.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Replay: festivals → schedule items → reminders so plan membership exists before items/reminders that depend on it. */
export function orderQueueForReplay(items: QueuedPlannerMutation[]): QueuedPlannerMutation[] {
  const compacted = compactPlannerQueueForPersistence(items);
  const festivals = compacted.filter((i): i is QueuedPlannerMutation & { kind: 'festival' } => i.kind === 'festival');
  const schedules = compacted.filter(
    (i): i is QueuedPlannerMutation & { kind: 'scheduleItem' } => i.kind === 'scheduleItem',
  );
  const reminders = compacted.filter(
    (i): i is QueuedPlannerMutation & { kind: 'reminder' } => i.kind === 'reminder',
  );
  return [...festivals, ...schedules, ...reminders];
}

async function readQueue(): Promise<QueuedPlannerMutation[]> {
  const v1Raw = await AsyncStorage.getItem(STORAGE_KEY_V1);
  const v2Raw = await AsyncStorage.getItem(STORAGE_KEY_V2);
  const raw = v2Raw != null ? parseQueueJson(v2Raw) : parseQueueJson(v1Raw);
  const compacted = compactPlannerQueueForPersistence(raw);
  const shouldPersist =
    v1Raw != null || compacted.length !== raw.length || (v2Raw == null && compacted.length > 0);
  if (v1Raw != null) {
    await AsyncStorage.removeItem(STORAGE_KEY_V1);
  }
  if (shouldPersist) {
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(compacted.slice(-MAX_QUEUE_SIZE)));
  }
  return compacted;
}

async function writeQueue(queue: QueuedPlannerMutation[]): Promise<void> {
  const next = compactPlannerQueueForPersistence(queue).slice(-MAX_QUEUE_SIZE);
  await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next));
}

export function isLikelyOfflinePlannerError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|networkerror|internet|offline/i.test(message);
}

function reminderMatchesServer(
  state: MobilePlanStateDto,
  festivalId: string,
  desired: MobilePlanReminderType,
): boolean {
  const current = state.reminders[festivalId]?.type ?? 'default';
  return current === desired;
}

export async function enqueueFestivalPlanMutation(festivalId: string, desiredSaved: boolean) {
  const current = await readQueue();
  const existing = current.find((item) => item.kind === 'festival' && item.festivalId === festivalId);
  if (existing && existing.kind === 'festival' && existing.desiredSaved === desiredSaved) {
    return;
  }
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
  if (isSyntheticPlannerScheduleItemId(scheduleItemId)) return;
  const current = await readQueue();
  const existing = current.find(
    (item) => item.kind === 'scheduleItem' && item.scheduleItemId === scheduleItemId,
  );
  if (existing && existing.kind === 'scheduleItem' && existing.desiredInPlan === desiredInPlan) {
    return;
  }
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

export async function enqueueReminderPlanMutation(festivalId: string, reminderType: MobilePlanReminderType) {
  const current = await readQueue();
  const existing = current.find((item) => item.kind === 'reminder' && item.festivalId === festivalId);
  if (existing && existing.kind === 'reminder' && existing.reminderType === reminderType) {
    return;
  }
  const next = current.filter((item) => !(item.kind === 'reminder' && item.festivalId === festivalId));
  next.push({
    id: nowId('reminder'),
    kind: 'reminder',
    festivalId,
    reminderType,
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
  let reminders = { ...state.reminders };

  const ordered = orderQueueForReplay(queue);
  for (const item of ordered) {
    if (item.kind === 'festival') {
      savedFestivalIds = item.desiredSaved
        ? [item.festivalId, ...savedFestivalIds.filter((id) => id !== item.festivalId)]
        : savedFestivalIds.filter((id) => id !== item.festivalId);
      if (!item.desiredSaved) {
        const { [item.festivalId]: _, ...rest } = reminders;
        reminders = rest;
      }
    } else if (item.kind === 'scheduleItem') {
      savedScheduleItemIds = item.desiredInPlan
        ? [item.scheduleItemId, ...savedScheduleItemIds.filter((id) => id !== item.scheduleItemId)]
        : savedScheduleItemIds.filter((id) => id !== item.scheduleItemId);
    } else {
      reminders = {
        ...reminders,
        [item.festivalId]: { type: item.reminderType, updated_at: item.createdAt },
      };
    }
  }

  const savedSet = new Set(savedFestivalIds);
  for (const id of Object.keys(reminders)) {
    if (!savedSet.has(id)) {
      const { [id]: _, ...rest } = reminders;
      reminders = rest;
    }
  }

  return {
    ...state,
    savedFestivalIds,
    savedScheduleItemIds,
    reminders,
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
    const queue = orderQueueForReplay(await readQueue());
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
        } else if (item.kind === 'scheduleItem') {
          const hasItem = serverState.savedScheduleItemIds.includes(item.scheduleItemId);
          if (hasItem !== item.desiredInPlan) {
            await toggleScheduleItemInPlan(item.scheduleItemId);
          }
        } else if (!reminderMatchesServer(serverState, item.festivalId, item.reminderType)) {
          await updateFestivalReminder(item.festivalId, item.reminderType);
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
