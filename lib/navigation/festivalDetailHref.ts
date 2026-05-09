import type { Href } from 'expo-router';

/**
 * In-app href for festival detail inside the main tab navigator so the bottom tab bar stays visible.
 * Use instead of `/festival/...`, which can resolve outside `(tabs)` if a duplicate route exists.
 */
export function festivalDetailHref(slug: string, query?: Record<string, string | undefined>): Href {
  const path = `/(tabs)/festival/${slug}`;
  if (!query) return path as Href;
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  if (pairs.length === 0) return path as Href;
  return `${path}?${pairs.join('&')}` as Href;
}
