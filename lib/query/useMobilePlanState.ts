import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { getMobilePlanState, type MobilePlanReminderDto, type MobilePlanStateDto } from '@/lib/api/mobilePlan';
import { updateFestivalSavedStateInCache } from '@/lib/query/festivalSavedCache';
import type { FollowFeedPage } from '@/lib/api/followFeed';
import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import type { OrganizerDetail } from '@/lib/api/organizers';

function patchFollowingFeedSaved(data: unknown, savedSet: Set<string>): unknown {
  const rec = data as { pages?: unknown[] } | null;
  if (!rec || !Array.isArray(rec.pages)) return data;
  let changed = false;
  const pages = rec.pages.map((page) => {
    const p = page as FollowFeedPage;
    if (!Array.isArray(p?.items)) return page;
    const items = p.items.map((item) => {
      if (!item?.festival) return item;
      const nextSaved = savedSet.has(item.festival.festivalId);
      if (item.festival.saved === nextSaved) return item;
      changed = true;
      return { ...item, festival: { ...item.festival, saved: nextSaved } };
    });
    return items === p.items ? page : { ...p, items };
  });
  if (!changed) return data;
  return { ...rec, pages };
}

function patchOrganizerSaved(data: unknown, savedSet: Set<string>): unknown {
  const rec = data as OrganizerDetail | null;
  if (!rec || !Array.isArray(rec.festivals)) return data;
  let changed = false;
  const festivals = rec.festivals.map((festival) => {
    const nextSaved = savedSet.has(festival.festivalId);
    if (festival.saved === nextSaved) return festival;
    changed = true;
    return { ...festival, saved: nextSaved };
  });
  if (!changed) return data;
  return { ...rec, festivals };
}

function patchFestivalDetailSaved(data: unknown, savedSet: Set<string>): unknown {
  const rec = data as FestivalDetail | null;
  if (!rec || typeof rec.festivalId !== 'string') return data;
  const nextSaved = savedSet.has(rec.festivalId);
  if (rec.saved === nextSaved) return data;
  return { ...rec, saved: nextSaved };
}

export function useMobilePlanState() {
  const queryClient = useQueryClient();
  const query = useQuery<MobilePlanStateDto>({
    queryKey: ['mobilePlanState'],
    queryFn: ({ signal }) => getMobilePlanState(signal),
    staleTime: 30_000,
    refetchOnReconnect: true,
  });

  const savedFestivalIds = useMemo(() => query.data?.savedFestivalIds ?? [], [query.data?.savedFestivalIds]);
  const savedFestivalIdSet = useMemo(() => new Set(savedFestivalIds), [savedFestivalIds]);
  const reminders = useMemo<Record<string, MobilePlanReminderDto>>(
    () => query.data?.reminders ?? {},
    [query.data?.reminders],
  );
  const stats = useMemo(
    () =>
      query.data?.stats ?? {
        savedFestivalCount: 0,
        plannedItemCount: 0,
        upcomingCount: 0,
      },
    [query.data?.stats],
  );

  const isSaved = useCallback((festivalId: string) => savedFestivalIdSet.has(festivalId), [savedFestivalIdSet]);

  useEffect(() => {
    if (!query.data) return;
    const savedSet = new Set(query.data.savedFestivalIds);
    for (const [queryKey, data] of queryClient.getQueriesData({ type: 'all' })) {
      if (!Array.isArray(queryKey) || queryKey.length === 0) continue;
      const root = String(queryKey[0] ?? '');
      let next = data;
      if (root === 'festivals' || root === 'search') {
        next = query.data.savedFestivalIds.reduce((acc, id) => {
          const shouldSave = savedSet.has(id);
          return updateFestivalSavedStateInCache(acc, { festivalId: id }, shouldSave);
        }, data);
      } else if (root === 'festival') {
        next = patchFestivalDetailSaved(data, savedSet);
      } else if (root === 'feed' && queryKey[1] === 'following') {
        next = patchFollowingFeedSaved(data, savedSet);
      } else if (root === 'organizer') {
        next = patchOrganizerSaved(data, savedSet);
      }
      if (next !== data) {
        queryClient.setQueryData(queryKey, next);
      }
    }
  }, [query.data, queryClient]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const state = queryClient.getQueryState<MobilePlanStateDto>(['mobilePlanState']);
      const updatedAt = state?.dataUpdatedAt ?? 0;
      const staleFor = Date.now() - updatedAt;
      if (staleFor < 20_000) return;
      if (state?.fetchStatus === 'fetching') return;
      queryClient.invalidateQueries({ queryKey: ['mobilePlanState'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  return {
    ...query,
    savedFestivalIds,
    reminders,
    stats,
    isSaved,
  };
}

export type MobilePlanStateQuery = ReturnType<typeof useMobilePlanState>;
