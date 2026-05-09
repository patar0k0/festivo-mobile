import type { OnboardingOrganizerSuggestion } from '@/lib/api/onboardingSuggestions';

/** Conservative slug pattern — no spaces, URL-safe segments. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const MAX_ORGANIZER_SUGGESTIONS = 40;

/**
 * Dedupe by id, drop invalid rows, deterministic sort. Client-only; does not change API.
 */
export function prepareOnboardingOrganizerSuggestions(
  rows: OnboardingOrganizerSuggestion[],
): OnboardingOrganizerSuggestion[] {
  const seen = new Set<string>();
  const out: OnboardingOrganizerSuggestion[] = [];
  for (const o of rows) {
    const id = o.id.trim();
    const name = o.name.trim();
    const slug = o.slug.trim();
    if (!id || !name || !slug) continue;
    if (!SLUG_RE.test(slug)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...o,
      id,
      name,
      slug,
      categories: o.categories.map((c) => c.trim()).filter(Boolean),
    });
  }
  out.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'bg', { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  );
  return out.slice(0, MAX_ORGANIZER_SUGGESTIONS);
}
