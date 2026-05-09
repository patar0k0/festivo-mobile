import { type Query, type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import type { FollowFeedPage } from '@/lib/api/followFeed';
import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { removeFestivalFromPlan, saveFestivalToPlan, type MobilePlanStateDto } from '@/lib/api/mobilePlan';
import type { OrganizerDetail } from '@/lib/api/organizers';
import { enqueueFestivalPlanMutation, isLikelyOfflinePlannerError } from '@/lib/plan/offlineQueue';
import {
  festivalRefMatches,
  flattenFestivalListQueryData,
  patchFestivalDetailSaved,
  resolveCurrentSavedFromCaches,
  type FestivalSavedRef,
  updateFestivalSavedStateInCache,
} from '@/lib/query/festivalSavedCache';

type ToggleInput = {
  festivalId: string;
  slug?: string;
  festival?: FestivalListItem | FestivalDetail;
};

type Snapshot = {
  queryKey: QueryKey;
  data: unknown;
};

type ToggleContext = {
  snapshots: Snapshot[];
  ref: FestivalSavedRef;
  nextSaved: boolean;
};

function isTargetQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  const root = String(key[0] ?? '');
  return (
    root === 'festivals' ||
    root === 'search' ||
    root === 'festival' ||
    root === 'feed' ||
    root === 'organizer' ||
    root === 'mobilePlanState'
  );
}

function patchFollowingFeedSaved(data: unknown, ref: FestivalSavedRef, nextSaved: boolean): unknown {
  const rec = data as { pages?: unknown[] } | null;
  if (!rec || !Array.isArray(rec.pages)) return data;
  let changed = false;
  const pages = rec.pages.map((page) => {
    const p = page as FollowFeedPage;
    if (!Array.isArray(p?.items)) return page;
    const items = p.items.map((item) => {
      if (!item?.festival || !festivalRefMatches(item.festival, ref)) return item;
      if (item.festival.saved === nextSaved) return item;
      changed = true;
      return { ...item, festival: { ...item.festival, saved: nextSaved } };
    });
    return items === p.items ? page : { ...p, items };
  });
  if (!changed) return data;
  return { ...rec, pages };
}

function patchOrganizerSaved(data: unknown, ref: FestivalSavedRef, nextSaved: boolean): unknown {
  const rec = data as OrganizerDetail | null;
  if (!rec || !Array.isArray(rec.festivals)) return data;
  let changed = false;
  const festivals = rec.festivals.map((festival) => {
    if (!festivalRefMatches(festival, ref) || festival.saved === nextSaved) return festival;
    changed = true;
    return { ...festival, saved: nextSaved };
  });
  return changed ? { ...rec, festivals } : data;
}

function patchMobilePlanState(data: unknown, festivalId: string, nextSaved: boolean): unknown {
  const plan = data as MobilePlanStateDto | null;
  if (!plan || !Array.isArray(plan.savedFestivalIds)) return data;
  const exists = plan.savedFestivalIds.includes(festivalId);
  if (nextSaved === exists) return data;
  const savedFestivalIds = nextSaved
    ? [festivalId, ...plan.savedFestivalIds.filter((id) => id !== festivalId)]
    : plan.savedFestivalIds.filter((id) => id !== festivalId);
  const reminders = { ...plan.reminders };
  if (!nextSaved) delete reminders[festivalId];
  return {
    ...plan,
    savedFestivalIds,
    reminders,
    stats: {
      ...plan.stats,
      savedFestivalCount: Math.max(0, savedFestivalIds.length),
    },
  };
}

function patchAllQueries(queryKey: QueryKey, data: unknown, ref: FestivalSavedRef, nextSaved: boolean): unknown {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return data;
  const root = String(queryKey[0] ?? '');
  if (root === 'festivals' || root === 'search') {
    return updateFestivalSavedStateInCache(data, ref, nextSaved);
  }
  if (root === 'festival') {
    return patchFestivalDetailSaved(data as FestivalDetail | undefined, ref, nextSaved);
  }
  if (root === 'feed' && queryKey[1] === 'following') {
    return patchFollowingFeedSaved(data, ref, nextSaved);
  }
  if (root === 'organizer') {
    return patchOrganizerSaved(data, ref, nextSaved);
  }
  if (root === 'mobilePlanState') {
    return patchMobilePlanState(data, ref.festivalId, nextSaved);
  }
  return data;
}

function buildRef(input: ToggleInput): FestivalSavedRef {
  return { festivalId: input.festivalId, slug: input.slug ?? input.festival?.slug };
}

export function useTogglePlanFestivalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ToggleInput) => {
      const currentPlan = queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState']);
      const currentlySaved = Boolean(currentPlan?.savedFestivalIds.includes(input.festivalId));
      return currentlySaved
        ? removeFestivalFromPlan(input.festivalId)
        : saveFestivalToPlan(input.festivalId);
    },
    onMutate: async (input): Promise<ToggleContext> => {
      const ref = buildRef(input);
      const predicate = { predicate: isTargetQuery, type: 'all' as const };
      await queryClient.cancelQueries(predicate);
      const snapshots = queryClient
        .getQueriesData(predicate)
        .map(([queryKey, data]) => ({ queryKey, data }));

      const flatLists = snapshots.flatMap((s) => flattenFestivalListQueryData(s.data));
      const detail = ref.slug ? queryClient.getQueryData<FestivalDetail>(['festival', ref.slug]) : undefined;
      const fromPlan = Boolean(
        queryClient.getQueryData<MobilePlanStateDto>(['mobilePlanState'])?.savedFestivalIds.includes(ref.festivalId),
      );
      const currentSaved = resolveCurrentSavedFromCaches({
        flatListItems: flatLists,
        ref,
        detail,
        inSavedFestivalsList: fromPlan,
      });
      const nextSaved = !currentSaved;

      for (const { queryKey, data } of snapshots) {
        const next = patchAllQueries(queryKey, data, ref, nextSaved);
        if (next !== data) queryClient.setQueryData(queryKey, next);
      }

      return { snapshots, ref, nextSaved };
    },
    onError: (error, _input, context) => {
      if (!context) return;
      if (isLikelyOfflinePlannerError(error)) {
        void enqueueFestivalPlanMutation(context.ref.festivalId, context.nextSaved);
        return;
      }
      for (const snapshot of context.snapshots) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.data);
      }
    },
    onSuccess: (result, _input, context) => {
      if (!context) return;
      const nextSaved = Boolean(result?.saved);
      for (const [queryKey, data] of queryClient.getQueriesData({ predicate: isTargetQuery, type: 'all' })) {
        const next = patchAllQueries(queryKey, data, context.ref, nextSaved);
        if (next !== data) {
          queryClient.setQueryData(queryKey, next);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });
}
