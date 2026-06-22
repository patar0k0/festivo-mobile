import { rankSearchResults } from '@/lib/search/searchRanking';
import { getFestivals, type FestivalListItem, type GetFestivalsParams } from './festivals';

/** When presets the user can pick; resolved to API params at query time. */
export type SearchWhenPreset =
  | 'today'
  | 'tomorrow'
  | 'weekend'
  | 'this_week'
  | 'this_month';

export type SearchFilters = {
  when?: SearchWhenPreset;
  city?: string;
  category?: string;
  free?: boolean;
};

export function hasActiveFilters(f: SearchFilters): boolean {
  return Boolean(f.when || f.city || f.category || f.free);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resolves a SearchWhenPreset to concrete `from`/`to` or `when` API params. */
function resolveWhenPreset(preset: SearchWhenPreset): Partial<GetFestivalsParams> {
  const today = new Date();
  switch (preset) {
    case 'today':
      return { startDate: ymd(today), endDate: ymd(today) };
    case 'tomorrow': {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return { startDate: ymd(t), endDate: ymd(t) };
    }
    case 'weekend':
      return { when: 'weekend' };
    case 'this_week':
      return { when: 'this_week' };
    case 'this_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { startDate: ymd(first), endDate: ymd(last) };
    }
  }
}

/** Converts SearchFilters to GetFestivalsParams fields. */
export function filtersToParams(filters: SearchFilters): Partial<GetFestivalsParams> {
  const params: Partial<GetFestivalsParams> = {};
  if (filters.when) Object.assign(params, resolveWhenPreset(filters.when));
  if (filters.city) params.city = filters.city;
  if (filters.category) params.category = filters.category;
  if (filters.free != null) params.free = filters.free;
  return params;
}

/**
 * Mobile festival search.
 * - With text query: fetches + re-ranks by relevance.
 * - Filter-only (no text): fetches sorted by trending; no re-rank.
 */
export async function searchFestivals(
  query: string,
  filters?: SearchFilters,
): Promise<FestivalListItem[]> {
  const q = query.trim();
  const hasQ = q.length >= 2;
  if (!hasQ && !hasActiveFilters(filters ?? {})) return [];

  const results = await getFestivals({
    q: hasQ ? q : undefined,
    limit: hasQ ? 50 : 40,
    sort: hasQ ? undefined : 'trending',
    ...filtersToParams(filters ?? {}),
  });

  return hasQ ? rankSearchResults(results, q) : results;
}
