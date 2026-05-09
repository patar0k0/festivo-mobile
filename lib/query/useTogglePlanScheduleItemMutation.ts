import { type Query, type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import { toggleScheduleItemInPlan, type MobilePlanStateDto } from '@/lib/api/mobilePlan';
import {
  enqueueScheduleItemPlanMutation,
  isLikelyOfflinePlannerError,
} from '@/lib/plan/offlineQueue';

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
};

function isTargetQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  return String(key[0] ?? '') === 'mobilePlanState';
}

function patchMobilePlanState(data: unknown, scheduleItemId: string, desiredInPlan: boolean): unknown {
  const plan = data as MobilePlanStateDto | null;
  if (!plan || !Array.isArray(plan.savedScheduleItemIds)) return data;
  const exists = plan.savedScheduleItemIds.includes(scheduleItemId);
  if (exists === desiredInPlan) return data;
  const savedScheduleItemIds = desiredInPlan
    ? [scheduleItemId, ...plan.savedScheduleItemIds.filter((id) => id !== scheduleItemId)]
    : plan.savedScheduleItemIds.filter((id) => id !== scheduleItemId);

  return {
    ...plan,
    savedScheduleItemIds,
    stats: {
      ...plan.stats,
      plannedItemCount: savedScheduleItemIds.length,
    },
  };
}

export function useTogglePlanScheduleItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleItemId }: ToggleInput) => toggleScheduleItemInPlan(scheduleItemId),
    onMutate: async ({ scheduleItemId }): Promise<ToggleContext> => {
      const predicate = { predicate: isTargetQuery, type: 'all' as const };
      await queryClient.cancelQueries(predicate);
      const snapshots = queryClient
        .getQueriesData(predicate)
        .map(([queryKey, data]) => ({ queryKey, data }));

      const currentPlan = queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState']);
      const desiredInPlan = !currentPlan?.savedScheduleItemIds.includes(scheduleItemId);

      for (const { queryKey, data } of snapshots) {
        const next = patchMobilePlanState(data, scheduleItemId, desiredInPlan);
        if (next !== data) queryClient.setQueryData(queryKey, next);
      }

      return { snapshots, scheduleItemId, desiredInPlan };
    },
    onError: (error, _input, context) => {
      if (!context) return;
      if (isLikelyOfflinePlannerError(error)) {
        void enqueueScheduleItemPlanMutation(context.scheduleItemId, context.desiredInPlan);
        return;
      }
      for (const snapshot of context.snapshots) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.data);
      }
    },
    onSuccess: (result, _input, context) => {
      if (!context) return;
      queryClient.setQueryData(['mobilePlanState'], (data: MobilePlanStateDto | undefined) =>
        patchMobilePlanState(data, context.scheduleItemId, Boolean(result?.inPlan)),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });
}
