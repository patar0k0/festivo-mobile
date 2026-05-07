import type { InfiniteData } from '@tanstack/react-query';

import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';

export type FestivalSavedRef = {
  festivalId: string;
  slug?: string;
};

function normalizeRefValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function readIdCandidate(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const src = item as Record<string, unknown>;
  return normalizeRefValue(src.festivalId ?? src.festival_id ?? src.id);
}

function readSlugCandidate(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const src = item as Record<string, unknown>;
  return normalizeRefValue(src.slug);
}

export function festivalRefMatches(
  item: Pick<FestivalListItem, 'festivalId' | 'slug'> | Record<string, unknown> | null | undefined,
  ref: FestivalSavedRef,
): boolean {
  const itemId = readIdCandidate(item);
  const refId = normalizeRefValue(ref.festivalId);
  if (itemId && refId) {
    if (itemId === refId) return true;
    if (itemId.toLowerCase() === refId.toLowerCase()) return true;
  }
  const itemSlug = readSlugCandidate(item);
  const refSlug = normalizeRefValue(ref.slug);
  if (refSlug && itemSlug) {
    if (itemSlug === refSlug) return true;
    if (itemSlug.toLowerCase() === refSlug.toLowerCase()) return true;
  }
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

type InfiniteFestivalObjectPages = {
  pages: Array<Record<string, unknown>>;
  pageParams?: unknown[];
};

function pageListKey(page: Record<string, unknown>): 'data' | 'items' | 'festivals' | null {
  if (Array.isArray(page.data)) return 'data';
  if (Array.isArray(page.items)) return 'items';
  if (Array.isArray(page.festivals)) return 'festivals';
  return null;
}

function isInfiniteFestivalObjectPages(data: unknown): data is InfiniteFestivalObjectPages {
  if (!data || typeof data !== 'object' || !('pages' in data)) return false;
  const pages = (data as InfiniteFestivalObjectPages).pages;
  return (
    Array.isArray(pages) &&
    pages.every((page) => {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return false;
      return pageListKey(page as Record<string, unknown>) != null;
    })
  );
}

/** Flat items from a cached list or infinite list query for saved-state resolution. */
export function flattenFestivalListQueryData(data: unknown): FestivalListItem[] {
  if (Array.isArray(data)) return data as FestivalListItem[];
  if (isInfiniteFestivalListPages(data)) {
    return data.pages.flat();
  }
  if (isInfiniteFestivalObjectPages(data)) {
    return data.pages.flatMap((page) => {
      const key = pageListKey(page);
      if (!key) return [];
      return page[key] as FestivalListItem[];
    });
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
  if (isInfiniteFestivalObjectPages(oldData)) {
    return {
      ...oldData,
      pages: oldData.pages.map((page) => {
        const key = pageListKey(page);
        if (!key) return page;
        const list = page[key] as FestivalListItem[];
        return { ...page, [key]: mapListSavedState(list, ref, nextSaved) };
      }),
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
