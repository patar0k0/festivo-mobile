import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  bumpPlannerMutationIntent,
  isLatestPlannerMutationIntent,
} from '@/lib/plan/plannerMutationIntent';
import {
  type MobilePlanReminderType,
  type MobilePlanStateDto,
  updateFestivalReminder,
} from '@/lib/api/mobilePlan';
import { enqueueReminderPlanMutation, isLikelyOfflinePlannerError } from '@/lib/plan/offlineQueue';

type ReminderVars = { festivalId: string; type: MobilePlanReminderType };

type ReminderContext = {
  prev: MobilePlanStateDto | undefined;
  intentSeq: number;
};

export function useUpdatePlanReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ festivalId, type }: ReminderVars) => updateFestivalReminder(festivalId, type),
    onMutate: async ({ festivalId, type }): Promise<ReminderContext> => {
      const intentSeq = bumpPlannerMutationIntent('reminder', festivalId);
      await queryClient.cancelQueries({ queryKey: ['mobilePlanState'] });
      const prev = queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState']);
      if (prev) {
        queryClient.setQueryData<MobilePlanStateDto>(['mobilePlanState'], {
          ...prev,
          reminders: {
            ...prev.reminders,
            [festivalId]: { type, updated_at: new Date().toISOString() },
          },
        });
      }
      return { prev, intentSeq };
    },
    onError: (err, variables, ctx) => {
      if (!ctx) return;
      if (!isLatestPlannerMutationIntent('reminder', variables.festivalId, ctx.intentSeq)) {
        return;
      }
      if (isLikelyOfflinePlannerError(err)) {
        void enqueueReminderPlanMutation(variables.festivalId, variables.type);
        return;
      }
      if (ctx.prev) {
        queryClient.setQueryData(['mobilePlanState'], ctx.prev);
      }
    },
    onSuccess: (result, variables, ctx) => {
      if (!ctx) return;
      if (!isLatestPlannerMutationIntent('reminder', variables.festivalId, ctx.intentSeq)) {
        return;
      }
      const type = result?.type ?? variables.type;
      queryClient.setQueryData<MobilePlanStateDto>(['mobilePlanState'], (current) => {
        if (!current) return current;
        return {
          ...current,
          reminders: {
            ...current.reminders,
            [variables.festivalId]: {
              type,
              updated_at: new Date().toISOString(),
            },
          },
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });
}
