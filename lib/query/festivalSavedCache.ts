import type { InfiniteData } from '@tanstack/react-query';

import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';

export type FestivalSavedRef = {
  festivalId: string;
  slug?: string;
};

export function festivalRefMatches(
  item: Pick<FestivalListItem, 'festivalId' | 'slug'>,
  ref: FestivalSavedRef,
): boolean {
  const itemId = String(item.festivalId ?? '').trim();
  const refId = String(ref.festivalId ?? '').trim();
  if (itemId && refId) {
    if (itemId === refId) return true;
    if (itemId.toLowerCase() === refId.toLowerCase()) return true;
  }
  const itemSlug = String(item.slug ?? '').trim();
  const refSlug = ref.slug != null ? String(ref.slug).trim() : '';
  if (refSlug && itemSlug === refSlug) return true;
  return false;
}

/** Sets `saved` on matching rows (home lists, search flat arrays, etc.). */
export function mapListSavedState(
  items: FestivalListItem[],
  ref: FestivalSavedRef,
  nextSaved: boolean,
): FestivalListItem[] {
  return items.map((item) =>
    festivalRefMatches(item, ref) ? { ...item, saved: nextSaved } : item,
  );
}

/**
 * Whether the festival is currently saved, using every cache slice that can know.
 * Uses OR — stale `saved: false` on a list row must not hide membership in `savedFestivals`.
 */
export function resolveCurrentSavedFromCaches(input: {
  flatListItems: FestivalListItem[];
  ref: FestivalSavedRef;
  detail?: Pick<FestivalDetail, 'festivalId' | 'slug' | 'saved'> | null;
  inSavedFestivalsList: boolean;
}): boolean {
  const { flatListItems, ref, detail, inSavedFestivalsList } = input;
  if (inSavedFestivalsList) return true;
  if (detail && festivalRefMatches(detail, ref) && detail.saved) return true;
  return flatListItems.some((item) => festivalRefMatches(item, ref) && item.saved);
}

function isInfiniteFestivalListPages(data: unknown): data is InfiniteData<FestivalListItem[]> {
  if (!data || typeof data !== 'object' || !('pages' in data)) return false;
  const pages = (data as InfiniteData<FestivalListItem[]>).pages;
  return Array.isArray(pages) && pages.every((p) => Array.isArray(p));
}

/** Flat items from a cached list or infinite list query for saved-state resolution. */
export function flattenFestivalListQueryData(data: unknown): FestivalListItem[] {
  if (Array.isArray(data)) return data as FestivalListItem[];
  if (isInfiniteFestivalListPages(data)) {
    return data.pages.flat();
  }
  return [];
}

/**
 * Patch cached query data: plain `FestivalListItem[]` or infinite `{ pages: FestivalListItem[][] }`.
 * Other shapes returned unchanged.
 */
export function updateFestivalSavedStateInCache(
  oldData: unknown,
  ref: FestivalSavedRef,
  nextSaved: boolean,
): unknown {
  if (Array.isArray(oldData)) {
    return mapListSavedState(oldData as FestivalListItem[], ref, nextSaved);
  }
  if (isInfiniteFestivalListPages(oldData)) {
    const inf = oldData;
    return {
      ...inf,
      pages: inf.pages.map((page) => mapListSavedState(page, ref, nextSaved)),
    };
  }
  return oldData;
}

export function patchFestivalDetailSaved(
  detail: FestivalDetail | undefined,
  ref: FestivalSavedRef,
  nextSaved: boolean,
): FestivalDetail | undefined {
  if (!detail || !festivalRefMatches(detail, ref)) return detail;
  return { ...detail, saved: nextSaved };
}
