import { getFestivals } from './festivals';

export type DiscoveryCategory = {
  value: string;   // category string as stored in DB
  count: number;
};

export type DiscoveryPlace = {
  value: string;   // city_slug — safe to use as API filter value
  label: string;   // display name (may include "с." prefix)
  count: number;
};

export type DiscoveryMeta = {
  categories: DiscoveryCategory[];
  places: DiscoveryPlace[];
};

/**
 * Aggregates real category and place data from the existing festivals listing endpoint.
 * Fetches upcoming festivals sorted by trending, then counts unique categories and cities.
 *
 * Uses only existing API endpoints — no separate deployment needed.
 */
export async function getDiscoveryMeta(): Promise<DiscoveryMeta> {
  const festivals = await getFestivals({
    when: 'upcoming',
    sort: 'trending',
    limit: 200,
  });

  const catCounts = new Map<string, number>();
  // value = city_slug, label = display name
  const placeCounts = new Map<string, number>();
  const placeLabels = new Map<string, string>();

  for (const f of festivals) {
    // Categories
    const cat = f.category?.trim();
    if (cat) {
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    }

    // Places — prefer city_slug (reliable API filter); fall back to display name
    // until city_slug is deployed in the web API response.
    const slug = f.city_slug?.trim();
    const label = f.city?.trim();
    if (label) {
      const key = slug ?? label;
      placeCounts.set(key, (placeCounts.get(key) ?? 0) + 1);
      if (!placeLabels.has(key)) {
        placeLabels.set(key, label);
      }
    }
  }

  const categories: DiscoveryCategory[] = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));

  const places: DiscoveryPlace[] = [...placeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      label: placeLabels.get(value) ?? value,
      count,
    }));

  return { categories, places };
}
