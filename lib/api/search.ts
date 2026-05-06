import { getFestivals, type FestivalListItem } from './festivals';

/**
 * Mobile festival search via existing listing endpoint: GET /api/mobile/festivals?q=
 */
export async function searchFestivals(query: string): Promise<FestivalListItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return getFestivals({ q, limit: 50 });
}
