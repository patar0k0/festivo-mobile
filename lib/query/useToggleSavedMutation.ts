import {
  type Query,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { toggleSaved } from '@/lib/api/saved';
import {
  festivalRefMatches,
  flattenFestivalListQueryData,
  patchFestivalDetailSaved,
  resolveCurrentSavedFromCaches,
  type FestivalSavedRef,
  updateFestivalSavedStateInCache,
} from '@/lib/query/festivalSavedCache';

type ToggleSavedInput = {
  festivalId: string;
  slug?: string;
  festival?: FestivalListItem | FestivalDetail;
};

type FestivalListQuerySnapshot = { queryKey: QueryKey; data: unknown };

type ToggleSavedContext = {
  festivalListSnapshots?: FestivalListQuerySnapshot[];
  savedFestivals?: FestivalListItem[];
  festivalDetail?: FestivalDetail;
  slug?: string;
};

function isFestivalListQuery(query: Query): boolean {
  const key = query.queryKey;
  return Array.isArray(key) && (key[0] === 'festivals' || key[0] === 'search');
}

function buildRef(input: ToggleSavedInput): FestivalSavedRef {
  return {
    festivalId: input.festivalId,
    slug: input.slug ?? input.festival?.slug,
  };
}

function buildListItem(source: ToggleSavedInput['festival']): FestivalListItem | null {
  if (!source) return null;
  return {
    festivalId: source.festivalId,
    slug: source.slug,
    title: source.title,
    city: source.city,
    start_date: source.start_date,
    saved: true,
  };
}

function isFestivalDetailPayload(f: ToggleSavedInput['festival']): f is FestivalDetail {
  return Boolean(f && typeof f === 'object' && 'description' in f && 'festivalId' in f);
}

/** Home feed query keys (must stay in sync when toggling from detail — those queries are often inactive). */
const HOME_FESTIVAL_LIST_KEYS = [
  ['festivals', 'trending'],
  ['festivals', 'week'],
  ['festivals', 'popular'],
] as const;

function listQueryFilterAll() {
  return { predicate: isFestivalListQuery, type: 'all' as const };
}

function toLoggableQueryKey(queryKey: QueryKey): string {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey);
  }
}

function logPatchedQuery(
  queryKey: QueryKey,
  beforeData: unknown,
  afterData: unknown,
  ref: FestivalSavedRef,
  phase: 'optimistic' | 'success',
) {
  if (!__DEV__) return;
  const beforeItem = flattenFestivalListQueryData(beforeData).find((item) => festivalRefMatches(item, ref));
  const afterItem = flattenFestivalListQueryData(afterData).find((item) => festivalRefMatches(item, ref));
  if (!beforeItem && !afterItem) return;
  console.log('[festivo] toggleSaved cache patch', {
    phase,
    queryKey: toLoggableQueryKey(queryKey),
    matchedFestivalId: afterItem?.festivalId ?? beforeItem?.festivalId ?? ref.festivalId,
    matchedSlug: afterItem?.slug ?? beforeItem?.slug ?? ref.slug ?? null,
    beforeSaved: beforeItem?.saved ?? null,
    afterSaved: afterItem?.saved ?? null,
  });
}
/**
 * Secondary pass: update rows by normalized slug (covers festivalId mismatches between list rows and toggle payload).
 */
function patchAllFestivalListsBySlug(queryClient: QueryClient, slug: string | undefined, saved: boolean) {
  const slugTrim = slug?.trim();
  if (!slugTrim) return;
  const filter = listQueryFilterAll();
  const refBySlug: FestivalSavedRef = { festivalId: '', slug: slugTrim };
  for (const [queryKey, data] of queryClient.getQueriesData(filter)) {
    const next = updateFestivalSavedStateInCache(data, refBySlug, saved);
    if (next === data) continue;
    queryClient.setQueryData(queryKey, next);
  }
  for (const key of HOME_FESTIVAL_LIST_KEYS) {
    const data = queryClient.getQueryData(key);
    if (data === undefined) continue;
    const next = updateFestivalSavedStateInCache(data, refBySlug, saved);
    if (next === data) continue;
    queryClient.setQueryData(key, next);
  }
}

/** Apply authoritative `saved` from the server to every list + detail slice that contains this festival. */
function syncSavedInAllCaches(queryClient: QueryClient, input: ToggleSavedInput, saved: boolean) {
  const ref = buildRef(input);
  const filter = listQueryFilterAll();
  for (const [queryKey, data] of queryClient.getQueriesData(filter)) {
    const next = updateFestivalSavedStateInCache(data, ref, saved);
    queryClient.setQueryData(queryKey, next);
    logPatchedQuery(queryKey, data, next, ref, 'success');
  }
  for (const key of HOME_FESTIVAL_LIST_KEYS) {
    const data = queryClient.getQueryData(key);
    if (data === undefined) continue;
    const next = updateFestivalSavedStateInCache(data, ref, saved);
    queryClient.setQueryData(key, next);
    logPatchedQuery(key, data, next, ref, 'success');
  }
  patchAllFestivalListsBySlug(queryClient, ref.slug, saved);
  const slug = ref.slug;
  if (slug) {
    const cached = queryClient.getQueryData<FestivalDetail>(['festival', slug]);
    if (cached && festivalRefMatches(cached, ref)) {
      const patched = patchFestivalDetailSaved(cached, ref, saved);
      if (patched) {
        queryClient.setQueryData<FestivalDetail>(['festival', slug], patched);
      }
    }
  }
}

export function useToggleSavedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ToggleSavedInput) => toggleSaved(input.festivalId),
    onMutate: async (input): Promise<ToggleSavedContext> => {
      const ref = buildRef(input);
      const listFilter = listQueryFilterAll();

      await Promise.all([
        queryClient.cancelQueries(listFilter),
        queryClient.cancelQueries({ queryKey: ['savedFestivals'] }),
        queryClient.cancelQueries({ queryKey: ['festival'] }),
      ]);

      const festivalListSnapshots: FestivalListQuerySnapshot[] = queryClient
        .getQueriesData(listFilter)
        .map(([queryKey, data]) => ({ queryKey, data }));

      const savedFestivals = queryClient.getQueryData<FestivalListItem[]>(['savedFestivals']);
      const slug = ref.slug;
      const festivalDetailFromCache = slug
        ? queryClient.getQueryData<FestivalDetail>(['festival', slug])
        : undefined;
      const festivalDetailFromInput = isFestivalDetailPayload(input.festival) ? input.festival : undefined;
      const festivalDetail = festivalDetailFromCache ?? festivalDetailFromInput;

      const flatFestivalLists = festivalListSnapshots.flatMap((s) => flattenFestivalListQueryData(s.data));
      const inSavedList = savedFestivals?.find((item) => festivalRefMatches(item, ref));

      const currentSavedState = resolveCurrentSavedFromCaches({
        flatListItems: flatFestivalLists,
        ref,
        detail: festivalDetail,
        inSavedFestivalsList: Boolean(inSavedList),
      });
      const nextSavedState = !currentSavedState;

      // #region agent log
      fetch('http://127.0.0.1:7454/ingest/f7b1cd1d-10a4-4fd2-b861-c1fca419479c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6a16' },
        body: JSON.stringify({
          sessionId: '3a6a16',
          runId: 'pre',
          hypothesisId: 'H2',
          location: 'useToggleSavedMutation.ts:onMutate:compute',
          message: 'toggle computed state',
          data: {
            festivalId: ref.festivalId,
            slug: ref.slug ?? null,
            currentSavedState,
            nextSavedState,
            inSavedList: Boolean(inSavedList),
            detailCachedSaved: festivalDetail?.saved ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      for (const { queryKey, data } of festivalListSnapshots) {
        const next = updateFestivalSavedStateInCache(data, ref, nextSavedState);
        queryClient.setQueryData(queryKey, next);
        logPatchedQuery(queryKey, data, next, ref, 'optimistic');
      }
      for (const key of HOME_FESTIVAL_LIST_KEYS) {
        const data = queryClient.getQueryData(key);
        if (data === undefined) continue;
        const next = updateFestivalSavedStateInCache(data, ref, nextSavedState);
        queryClient.setQueryData(key, next);
        logPatchedQuery(key, data, next, ref, 'optimistic');
      }
      patchAllFestivalListsBySlug(queryClient, ref.slug, nextSavedState);

      // #region agent log
      {
        const t = queryClient.getQueryData<FestivalListItem[]>(['festivals', 'trending']);
        const w = queryClient.getQueryData<FestivalListItem[]>(['festivals', 'week']);
        const p = queryClient.getQueryData<FestivalListItem[]>(['festivals', 'popular']);
        const pick = (arr: FestivalListItem[] | undefined) =>
          arr?.find((i) => festivalRefMatches(i, ref))?.saved;
        fetch('http://127.0.0.1:7454/ingest/f7b1cd1d-10a4-4fd2-b861-c1fca419479c', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6a16' },
          body: JSON.stringify({
            sessionId: '3a6a16',
            runId: 'pre',
            hypothesisId: 'H2',
            location: 'useToggleSavedMutation.ts:onMutate:afterPatchLists',
            message: 'cache after optimistic list patch',
            data: {
              festivalId: ref.festivalId,
              slug: ref.slug ?? null,
              nextSavedState,
              listSnapshotCount: festivalListSnapshots.length,
              matchingFlatCount: flatFestivalLists.filter((i) => festivalRefMatches(i, ref)).length,
              trendingMatchSaved: pick(t) ?? null,
              weekMatchSaved: pick(w) ?? null,
              popularMatchSaved: pick(p) ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion

      if (slug && festivalDetail && festivalRefMatches(festivalDetail, ref)) {
        const patched = patchFestivalDetailSaved(festivalDetail, ref, nextSavedState);
        if (patched) {
          queryClient.setQueryData<FestivalDetail>(['festival', slug], patched);
        }
        // #region agent log
        fetch('http://127.0.0.1:7454/ingest/f7b1cd1d-10a4-4fd2-b861-c1fca419479c', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6a16' },
          body: JSON.stringify({
            sessionId: '3a6a16',
            runId: 'pre',
            hypothesisId: 'H3',
            location: 'useToggleSavedMutation.ts:onMutate:detailPatch',
            message: 'detail optimistic branch',
            data: {
              slug,
              nextSavedState,
              hadDetail: Boolean(festivalDetail),
              patched: Boolean(patched),
              detailSavedAfter: patched?.saved ?? queryClient.getQueryData<FestivalDetail>(['festival', slug])?.saved,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (__DEV__) {
          console.log('[festivo] toggleSaved optimistic detail', { slug, nextSavedState });
        }
      }

      if (savedFestivals) {
        let nextSaved = savedFestivals.filter((item) => !festivalRefMatches(item, ref));
        if (nextSavedState) {
          const inFestivalList = flatFestivalLists.find((item) => festivalRefMatches(item, ref));
          const inDetail =
            festivalDetail && festivalRefMatches(festivalDetail, ref) ? festivalDetail : undefined;
          const optimisticItem =
            buildListItem(input.festival) ?? inFestivalList ?? (inDetail ? buildListItem(inDetail) : null);
          if (optimisticItem && !nextSaved.some((item) => festivalRefMatches(item, optimisticItem))) {
            nextSaved = [{ ...optimisticItem, saved: true }, ...nextSaved];
          }
        }
        queryClient.setQueryData<FestivalListItem[]>(['savedFestivals'], nextSaved);
      }

      return { festivalListSnapshots, savedFestivals, festivalDetail: festivalDetailFromCache, slug };
    },
    onSuccess: (data, variables) => {
      syncSavedInAllCaches(queryClient, variables, data.saved);
      if (__DEV__) {
        console.log('[festivo] toggleSaved onSuccess', {
          serverSaved: data.saved,
          festivalId: variables.festivalId,
          slug: variables.slug ?? variables.festival?.slug,
        });
      }
      // #region agent log
      fetch('http://127.0.0.1:7454/ingest/f7b1cd1d-10a4-4fd2-b861-c1fca419479c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6a16' },
        body: JSON.stringify({
          sessionId: '3a6a16',
          runId: 'post-fix',
          hypothesisId: 'H1',
          location: 'useToggleSavedMutation.ts:onSuccess',
          message: 'toggle API result + caches synced',
          data: {
            serverSaved: data.saved,
            festivalId: variables.festivalId,
            slug: variables.slug ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    },
    onError: (error, variables, context) => {
      // #region agent log
      fetch('http://127.0.0.1:7454/ingest/f7b1cd1d-10a4-4fd2-b861-c1fca419479c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6a16' },
        body: JSON.stringify({
          sessionId: '3a6a16',
          runId: 'pre',
          hypothesisId: 'H4',
          location: 'useToggleSavedMutation.ts:onError',
          message: 'toggle mutation error',
          data: {
            message: error instanceof Error ? error.message : String(error),
            festivalId: variables.festivalId,
            slug: variables.slug ?? null,
            hadContext: Boolean(context),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!context) return;
      if (context.festivalListSnapshots) {
        for (const { queryKey, data } of context.festivalListSnapshots) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context.savedFestivals) {
        queryClient.setQueryData(['savedFestivals'], context.savedFestivals);
      }
      if (context.slug && context.festivalDetail) {
        queryClient.setQueryData(['festival', context.slug], context.festivalDetail);
      }
    },
    onSettled: () => {
      if (__DEV__) {
        console.log('[festivo] toggleSaved mutation settled');
      }
      // Only refresh the saved-festivals tab source; do not refetch home/detail/search lists here —
      // that refetch was overwriting `saved` in cache (button snapped back) while the plan API had already updated.
      queryClient.invalidateQueries({ queryKey: ['savedFestivals'] });
    },
  });
}
