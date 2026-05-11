import { type Query, type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import type { FollowFeedPage } from '@/lib/api/followFeed';
import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { removeFestivalFromPlan, saveFestivalToPlan, type MobilePlanStateDto, type SavedFestivalBasicDto } from '@/lib/api/mobilePlan';
import type { OrganizerDetail } from '@/lib/api/organizers';
import { debugLogRare, debugLogWarn } from '@/lib/debug/mobileDiagnosticsHelpers';
import {
  bumpPlannerMutationIntent,
  isLatestPlannerMutationIntent,
} from '@/lib/plan/plannerMutationIntent';
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
  intentSeq: number;
};

// onMutate runs before mutationFn and optimistically patches the cache,
// so mutationFn cannot read the pre-toggle state from the cache. We stash
// the desired next state here so mutationFn can pick the correct API call.
const pendingNextSavedByFestivalId = new Map<string, boolean>();

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

function toSavedFestivalBasicDto(
  festivalId: string,
  festival: FestivalListItem | FestivalDetail | undefined,
): SavedFestivalBasicDto | null {
  if (!festival?.slug || !festival?.title) return null;
  return {
    festivalId,
    slug: festival.slug,
    title: festival.title,
    city: festival.city ?? null,
    start_date: festival.start_date ?? null,
    end_date: festival.end_date ?? null,
    image_url: festival.image_url ?? null,
    category: festival.category ?? null,
    is_verified: Boolean(festival.is_verified),
    organizer_name: festival.organizer_name ?? null,
  };
}

function patchMobilePlanState(
  data: unknown,
  festivalId: string,
  nextSaved: boolean,
  festivalData?: SavedFestivalBasicDto | null,
): unknown {
  const plan = data as MobilePlanStateDto | null;
  if (!plan || !Array.isArray(plan.savedFestivalIds)) return data;
  const exists = plan.savedFestivalIds.includes(festivalId);
  if (nextSaved === exists) return data;
  const savedFestivalIds = nextSaved
    ? [festivalId, ...plan.savedFestivalIds.filter((id) => id !== festivalId)]
    : plan.savedFestivalIds.filter((id) => id !== festivalId);
  let savedFestivals: SavedFestivalBasicDto[];
  if (nextSaved) {
    // Optimistically prepend the new festival object so the plan screen shows it immediately.
    const alreadyPresent = (plan.savedFestivals ?? []).some((f) => f.festivalId === festivalId);
    savedFestivals =
      festivalData && !alreadyPresent
        ? [festivalData, ...(plan.savedFestivals ?? [])]
        : (plan.savedFestivals ?? []);
  } else {
    savedFestivals = (plan.savedFestivals ?? []).filter((f) => f.festivalId !== festivalId);
  }
  const reminders = { ...plan.reminders };
  if (!nextSaved) delete reminders[festivalId];
  return {
    ...plan,
    savedFestivalIds,
    savedFestivals,
    reminders,
    stats: {
      ...plan.stats,
      savedFestivalCount: Math.max(0, savedFestivalIds.length),
    },
  };
}

function patchAllQueries(
  queryKey: QueryKey,
  data: unknown,
  ref: FestivalSavedRef,
  nextSaved: boolean,
  festivalData?: SavedFestivalBasicDto | null,
): unknown {
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
    return patchMobilePlanState(data, ref.festivalId, nextSaved, festivalData);
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
      const desiredNextSaved = pendingNextSavedByFestivalId.get(input.festivalId);
      pendingNextSavedByFestivalId.delete(input.festivalId);
      const shouldSave =
        desiredNextSaved ??
        !queryClient
          .getQueryData<MobilePlanStateDto>(['mobilePlanState'])
          ?.savedFestivalIds.includes(input.festivalId);
      return shouldSave
        ? saveFestivalToPlan(input.festivalId)
        : removeFestivalFromPlan(input.festivalId);
    },
    onMutate: async (input): Promise<ToggleContext> => {
      const ref = buildRef(input);
      const intentSeq = bumpPlannerMutationIntent('festival', input.festivalId);
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
      pendingNextSavedByFestivalId.set(ref.festivalId, nextSaved);
      // Build SavedFestivalBasicDto from the input so we can optimistically show the festival
      // on the plan screen immediately without waiting for the server refetch.
      const festivalData = nextSaved
        ? toSavedFestivalBasicDto(ref.festivalId, input.festival ?? detail)
        : null;

      let changedCount = 0;
      for (const { queryKey, data } of snapshots) {
        const next = patchAllQueries(queryKey, data, ref, nextSaved, festivalData);
        if (next !== data) {
          changedCount += 1;
          queryClient.setQueryData(queryKey, next);
        }
      }

      if (changedCount > 0) {
        debugLogRare(`planner_toggle_optimistic:festival:${ref.festivalId}`, {
          type: 'planner_toggle_optimistic',
          scope: 'planner',
          message: 'Festival planner toggle applied optimistically.',
          meta: {
            festivalId: ref.festivalId,
            nextSaved,
            snapshotCount: snapshots.length,
            changedCount,
          },
        }, 750);
      }

      return { snapshots, ref, nextSaved, intentSeq };
    },
    onError: (error, _input, context) => {
      if (__DEV__) {
        console.error('[planToggle] ГРЕШКА:', error instanceof Error ? error.message : String(error), '| festivalId:', _input?.festivalId);
      }
      if (!context) return;
      if (!isLatestPlannerMutationIntent('festival', context.ref.festivalId, context.intentSeq)) {
        return;
      }
      if (isLikelyOfflinePlannerError(error)) {
        void enqueueFestivalPlanMutation(context.ref.festivalId, context.nextSaved);
        return;
      }
      for (const snapshot of context.snapshots) {
        queryClient.setQueryData(snapshot.queryKey, snapshot.data);
      }
      debugLogWarn({
        type: 'planner_toggle_rollback',
        scope: 'planner',
        message: 'Festival planner toggle rolled back.',
        meta: {
          festivalId: context.ref.festivalId,
          nextSaved: context.nextSaved,
          error,
        },
      });
    },
    onSuccess: (result, _input, context) => {
      if (!context) return;
      if (!isLatestPlannerMutationIntent('festival', context.ref.festivalId, context.intentSeq)) {
        return;
      }
      const nextSaved = Boolean(result?.saved);
      for (const [queryKey, data] of queryClient.getQueriesData({ predicate: isTargetQuery, type: 'all' })) {
        const next = patchAllQueries(queryKey, data, context.ref, nextSaved);
        if (next !== data) {
          queryClient.setQueryData(queryKey, next);
        }
      }
      debugLogRare(`planner_toggle_reconcile:festival:${context.ref.festivalId}`, {
        type: 'planner_toggle_reconcile',
        scope: 'planner',
        message: 'Festival planner toggle reconciled with server.',
        meta: {
          festivalId: context.ref.festivalId,
          serverSaved: nextSaved,
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    },
  });
}
