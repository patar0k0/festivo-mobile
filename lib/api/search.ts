import { rankSearchResults } from '@/lib/search/searchRanking';

import { getFestivals, type FestivalListItem } from './festivals';

/**
 * Mobile festival search via existing listing endpoint: GET /api/mobile/festivals?q=
 * Results are re-ranked client-side for relevance (v2).
 */
export async function searchFestivals(query: string): Promise<FestivalListItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = await getFestivals({ q, limit: 50 });
  return rankSearchResults(results, q);
}
