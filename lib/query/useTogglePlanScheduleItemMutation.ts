import { type Query, type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import { toggleScheduleItemInPlan, type MobilePlanStateDto } from '@/lib/api/mobilePlan';
import { debugLogRare, debugLogWarn } from '@/lib/debug/mobileDiagnosticsHelpers';
import {
  bumpPlannerMutationIntent,
  isLatestPlannerMutationIntent,
} from '@/lib/plan/plannerMutationIntent';
import {
  enqueueScheduleItemPlanMutation,
  isLikelyOfflinePlannerError,
} from '@/lib/plan/offlineQueue';
import { patchMobilePlanSnapshotForItem, reconcileMobilePlanSnapshotItem } from '@/lib/plan/plannerPatch';
import { assertPlannerMutableScheduleItemId, isSyntheticPlannerScheduleItemId } from '@/lib/plan/scheduleItemId';

type ToggleInput = {
  scheduleItemId: string;
};

type Snapshot = {
  queryKey: QueryKey;
  data: unknown;
};

type ToggleContext = {
  snapshots: Snapshot[];
  scheduleItemId: string;
  desiredInPlan: boolean;
  intentSeq: number;
};

const serializedToggleTails = new Map<string, Promise<unknown>>();

function runSerializedScheduleToggle<T>(scheduleItemId: string, fn: () => Promise<T>): Promise<T> {
  const prev = serializedToggleTails.get(scheduleItemId) ?? Promise.resolve();
  const next = prev.then(() => fn()).finally(() => {
    if (serializedToggleTails.get(scheduleItemId) === next) {
      serializedToggleTails.delete(scheduleItemId);
    }
  });
  serializedToggleTails.set(scheduleItemId, next);
  return next as Promise<T>;
}

function isTargetQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  return String(key[0] ?? '') === 'mobilePlanState';
}

function patchAllMobilePlanQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  scheduleItemId: string,
  inPlan: boolean,
): number {
  const predicate = { predicate: isTargetQuery, type: 'all' as const };
  let changedCount = 0;
  for (const [queryKey, data] of queryClient.getQueriesData(predicate)) {
    const next = patchMobilePlanSnapshotForItem(data as MobilePlanStateDto | undefined, scheduleItemId, inPlan);
    if (next !== data) {
      changedCount += 1;
      queryClient.setQueryData(queryKey, next);
    }
  }
  return changedCount;
}

export function useTogglePlanScheduleItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleItemId }: ToggleInput) => {
      assertPlannerMutableScheduleItemId(scheduleItemId);
      return runSerializedScheduleToggle(scheduleItemId, () => toggleScheduleItemInPlan(scheduleItemId));
    },
    onMutate: async ({ scheduleItemId }): Promise<ToggleContext | undefined> => {
      if (isSyntheticPlannerScheduleItemId(scheduleItemId)) {
        return undefined;
      }
      const intentSeq = bumpPlannerMutationIntent('schedule', scheduleItemId);
      const predicate = { predicate: isTargetQuery, type: 'all' as const };
      await queryClient.cancelQueries(predicate);
      const snapshots = queryClient
        .getQueriesData(predicate)
        .map(([queryKey, data]) => ({ queryKey, data }));

      const currentPlan = queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState']);
      const desiredInPlan = !currentPlan?.savedScheduleItemIds.includes(scheduleItemId);

      const changedCount = patchAllMobilePlanQueries(queryClient, scheduleItemId, desiredInPlan);
      if (changedCount > 0) {
        debugLogRare(`planner_toggle_optimistic:schedule:${scheduleItemId}`, {
          type: 'planner_toggle_optimistic',
          scope: 'planner',
          message: 'Schedule item planner toggle applied optimistically.',
          meta: {
            scheduleItemId,
            desiredInPlan,
            snapshotCount: snapshots.length,
            changedCount,
          },
        }, 750);
      }

      return { snapshots, scheduleItemId, desiredInPlan, intentSeq };
    },
    onError: (error, variables, context) => {
      if (!context) return;
      if (!isLatestPlannerMutationIntent('schedule', variables.scheduleItemId, context.intentSeq)) {
        return;
      }
      if (isLikelyOfflinePlannerError(error)) {
        void enqueueScheduleItemPlanMutation(variables.scheduleItemId, context.desiredInPlan);
        return;
      }
      for (const snapshot of context.snapshots) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.data);
      }
      debugLogWarn({
        type: 'planner_toggle_rollback',
        scope: 'planner',
        message: 'Schedule item planner toggle rolled back.',
        meta: {
          scheduleItemId: variables.scheduleItemId,
          desiredInPlan: context.desiredInPlan,
          error,
        },
      });
    },
    onSuccess: (result, variables, context) => {
      if (!context) return;
      if (!isLatestPlannerMutationIntent('schedule', variables.scheduleItemId, context.intentSeq)) {
        return;
      }
      const serverInPlan = Boolean(result?.inPlan);
      queryClient.setQueryData(['mobilePlanState'], (data: MobilePlanStateDto | undefined) =>
        reconcileMobilePlanSnapshotItem(data, variables.scheduleItemId, serverInPlan),
      );
      debugLogRare(`planner_toggle_reconcile:schedule:${variables.scheduleItemId}`, {
        type: 'planner_toggle_reconcile',
        scope: 'planner',
        message: 'Schedule item planner toggle reconciled with server.',
        meta: {
          scheduleItemId: variables.scheduleItemId,
          serverInPlan,
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });
}
