import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import {
  getMobilePlanState,
  removeFestivalFromPlan,
  saveFestivalToPlan,
  setScheduleItemInPlan,
  updateFestivalReminder,
  type MobilePlanReminderType,
  type MobilePlanStateDto,
} from '@/lib/api/mobilePlan';
import { debugLogError, debugLogRare, debugLogWarn } from '@/lib/debug/mobileDiagnosticsHelpers';
import { isSyntheticPlannerScheduleItemId } from '@/lib/plan/scheduleItemId';

const STORAGE_KEY_V1 = 'festivo.plannerMutationQueue.v1';
const STORAGE_KEY_V2 = 'festivo.plannerMutationQueue.v2';
const MAX_QUEUE_SIZE = 80;
/** Drop queued mutations older than this so replay cannot resurrect ancient intent after reinstall/long offline. */
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ENQUEUE_DIAGNOSTIC_WINDOW_MS = 5_000;

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
const enqueueDiagnosticLoggedAtByKey = new Map<string, number>();

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

function getOldestQueueAgeMs(queue: QueuedPlannerMutation[]): number | undefined {
  const timestamps = queue.map((item) => Date.parse(item.createdAt)).filter(Number.isFinite);
  if (!timestamps.length) return undefined;
  return Date.now() - Math.min(...timestamps);
}

function shouldEmitEnqueueDiagnostic(key: string): boolean {
  const now = Date.now();
  const previous = enqueueDiagnosticLoggedAtByKey.get(key) ?? 0;
  if (now - previous < ENQUEUE_DIAGNOSTIC_WINDOW_MS) return false;
  enqueueDiagnosticLoggedAtByKey.set(key, now);
  return true;
}

function emitQueueEnqueueDiagnostic(item: QueuedPlannerMutation, queueSize: number): void {
  const key = queueDedupeKey(item);
  if (!shouldEmitEnqueueDiagnostic(key)) return;
  debugLogWarn({
    type: 'planner_queue_enqueue',
    scope: 'queue',
    message: 'Planner mutation queued for offline replay.',
    meta: {
      kind: item.kind,
      festivalId: item.kind === 'festival' || item.kind === 'reminder' ? item.festivalId : undefined,
      scheduleItemId: item.kind === 'scheduleItem' ? item.scheduleItemId : undefined,
      queueSize,
    },
  });
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
  const item: QueuedPlannerMutation = {
    id: nowId('festival'),
    kind: 'festival',
    festivalId,
    desiredSaved,
    createdAt: new Date().toISOString(),
  };
  next.push(item);
  await writeQueue(next);
  emitQueueEnqueueDiagnostic(item, compactPlannerQueueForPersistence(next).slice(-MAX_QUEUE_SIZE).length);
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
  const item: QueuedPlannerMutation = {
    id: nowId('schedule'),
    kind: 'scheduleItem',
    scheduleItemId,
    desiredInPlan,
    createdAt: new Date().toISOString(),
  };
  next.push(item);
  await writeQueue(next);
  emitQueueEnqueueDiagnostic(item, compactPlannerQueueForPersistence(next).slice(-MAX_QUEUE_SIZE).length);
}

export async function enqueueReminderPlanMutation(festivalId: string, reminderType: MobilePlanReminderType) {
  const current = await readQueue();
  const existing = current.find((item) => item.kind === 'reminder' && item.festivalId === festivalId);
  if (existing && existing.kind === 'reminder' && existing.reminderType === reminderType) {
    return;
  }
  const next = current.filter((item) => !(item.kind === 'reminder' && item.festivalId === festivalId));
  const item: QueuedPlannerMutation = {
    id: nowId('reminder'),
    kind: 'reminder',
    festivalId,
    reminderType,
    createdAt: new Date().toISOString(),
  };
  next.push(item);
  await writeQueue(next);
  emitQueueEnqueueDiagnostic(item, compactPlannerQueueForPersistence(next).slice(-MAX_QUEUE_SIZE).length);
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
  const startedAt = Date.now();
  debugLogRare('planner_hydrate_start:queue', {
    type: 'planner_hydrate_start',
    scope: 'queue',
    message: 'Queued planner hydration started.',
  });
  try {
    const queue = await readQueue();
    if (!queue.length) {
      debugLogRare('planner_hydrate_success:queue:empty', {
        type: 'planner_hydrate_success',
        scope: 'queue',
        message: 'Queued planner hydration completed with an empty queue.',
        meta: { durationMs: Date.now() - startedAt, queueSize: 0 },
      });
      return;
    }
    let hadPlanState = false;
    queryClient.setQueryData<MobilePlanStateDto>(['mobilePlanState'], (current) => {
      hadPlanState = Boolean(current);
      return patchPlanStateFromQueue(current, queue);
    });
    const hydrateEvent = {
      type: hadPlanState ? 'planner_hydrate_success' : 'planner_hydrate_partial',
      scope: 'queue',
      message: hadPlanState
        ? 'Queued planner hydration applied to cached plan state.'
        : 'Queued planner hydration found queued intent before plan state was cached.',
      meta: {
        durationMs: Date.now() - startedAt,
        queueSize: queue.length,
        staleAgeMs: getOldestQueueAgeMs(queue),
      },
    } as const;
    if (hadPlanState) {
      debugLogRare('planner_hydrate_success:queue:applied', hydrateEvent);
    } else {
      debugLogWarn(hydrateEvent);
    }
  } catch (error) {
    debugLogError({
      type: 'planner_hydrate_error',
      scope: 'queue',
      message: 'Queued planner hydration failed.',
      meta: { durationMs: Date.now() - startedAt, error },
    });
    throw error;
  }
}

export async function replayQueuedPlannerMutations(queryClient: QueryClient): Promise<void> {
  if (replayPromise) return replayPromise;

  replayPromise = (async () => {
    const queue = orderQueueForReplay(await readQueue());
    if (!queue.length) return;
    const startedAt = Date.now();
    debugLogRare('planner_queue_replay_start', {
      type: 'planner_queue_replay_start',
      scope: 'queue',
      message: 'Queued planner replay started.',
      meta: {
        queueSize: queue.length,
        staleAgeMs: getOldestQueueAgeMs(queue),
      },
    });

    let serverState: MobilePlanStateDto;
    try {
      serverState = await getMobilePlanState();
    } catch (error) {
      debugLogError({
        type: 'planner_queue_replay_error',
        scope: 'queue',
        message: 'Queued planner replay could not load server state.',
        meta: {
          durationMs: Date.now() - startedAt,
          queueSize: queue.length,
          error,
        },
      });
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
            await setScheduleItemInPlan(item.scheduleItemId, item.desiredInPlan);
          }
        } else if (!reminderMatchesServer(serverState, item.festivalId, item.reminderType)) {
          await updateFestivalReminder(item.festivalId, item.reminderType);
        }
        serverState = await getMobilePlanState();
      } catch (error) {
        debugLogWarn({
          type: 'planner_queue_replay_error',
          scope: 'queue',
          message: 'Queued planner replay item failed and will remain queued.',
          meta: {
            kind: item.kind,
            festivalId: item.kind === 'festival' || item.kind === 'reminder' ? item.festivalId : undefined,
            scheduleItemId: item.kind === 'scheduleItem' ? item.scheduleItemId : undefined,
            error,
          },
        });
        remaining.push(item);
      }
    }

    await writeQueue(remaining);
    queryClient.setQueryData(['mobilePlanState'], serverState);
    queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    const replayCompleteEvent = {
      type: remaining.length > 0 ? 'planner_queue_replay_error' : 'planner_queue_replay_success',
      scope: 'queue',
      message:
        remaining.length > 0
          ? 'Queued planner replay completed with partial failures.'
          : 'Queued planner replay completed successfully.',
      meta: {
        durationMs: Date.now() - startedAt,
        replayedCount: queue.length - remaining.length,
        remainingCount: remaining.length,
        partial_failures: remaining.length,
      },
    } as const;
    if (remaining.length > 0) {
      debugLogWarn(replayCompleteEvent);
    } else {
      debugLogRare('planner_queue_replay_success', replayCompleteEvent);
    }
  })().finally(() => {
    replayPromise = null;
  });

  return replayPromise;
}
