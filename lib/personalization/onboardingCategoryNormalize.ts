/**
 * Deterministic normalization for onboarding category labels (BG-friendly),
 * used only for deduping / grouping in the client. Does not change backend data.
 */

const MAX_CATEGORY_SUGGESTIONS = 48;

/** Letters treated as equivalent to Latin for fuzzy duplicate detection (common BG UI mix). */
const BG_LATIN_EQUIV: Record<string, string> = {
  а: 'a',
  А: 'a',
  в: 'b',
  В: 'b',
  е: 'e',
  Е: 'e',
  к: 'k',
  К: 'k',
  м: 'm',
  М: 'm',
  н: 'h',
  Н: 'h',
  о: 'o',
  О: 'o',
  р: 'p',
  Р: 'p',
  с: 'c',
  С: 'c',
  т: 't',
  Т: 't',
  у: 'y',
  У: 'y',
  х: 'x',
  Х: 'x',
};

const TRAILING_FESTIVAL_WORD = /\s+(фестивал|празник|събитие|събор|форум)$/iu;

function squashLatinEquivForCompare(ch: string): string {
  return BG_LATIN_EQUIV[ch] ?? ch;
}

/**
 * Lowercase, trim, collapse whitespace, strip punctuation for comparison key.
 */
export function normalizeCategoryLabelKey(label: string): string {
  let s = label.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  s = s.replace(/[`'"„“”‚‘’´.,;:!?·\-–—/\\|()[\]{}]+/g, '');
  s = s.replace(/\s+/g, '');
  return [...s].map(squashLatinEquivForCompare).join('');
}

/**
 * Strip trivial singular/plural and redundant trailing head nouns for grouping.
 */
export function categoryGroupingStem(label: string): string {
  let s = normalizeCategoryLabelKey(label);
  s = s.replace(/(а|я|и|е|о|ъ|ь)$/u, '');
  s = s.replace(TRAILING_FESTIVAL_WORD, '');
  return s;
}

function scoreLabelRichness(label: string): number {
  const t = label.trim();
  if (!t) return 0;
  let score = Math.min(40, t.length);
  if (/[а-яё]/iu.test(t)) score += 8;
  if (/фестивал|празник|събитие|събор/iu.test(t)) score += 6;
  if (/^[А-ЯЁ]/u.test(t)) score += 2;
  return score;
}

export function pickRicherLabel(a: string, b: string): string {
  const da = scoreLabelRichness(a);
  const db = scoreLabelRichness(b);
  if (db !== da) return db > da ? b : a;
  return a.length >= b.length ? a : b;
}

export type MergedCategorySuggestion = {
  slug: string;
  label_bg: string;
  icon?: string;
  /** All backend slugs merged into this row (for stable selection keys). */
  mergedSlugs: string[];
};

/**
 * Merge categories that normalize to the same grouping stem; keep one canonical label (richest).
 */
export function mergeOnboardingCategorySuggestions<T extends { slug: string; label_bg: string; icon?: string }>(
  rows: T[],
): MergedCategorySuggestion[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const slug = row.slug.trim();
    const label = row.label_bg.trim();
    if (!slug || !label) continue;
    const stem = categoryGroupingStem(label);
    if (!stem) continue;
    const g = groups.get(stem);
    if (g) g.push(row);
    else groups.set(stem, [row]);
  }

  const merged: MergedCategorySuggestion[] = [];
  for (const [, group] of groups) {
    if (group.length === 0) continue;
    const canonicalLabel = group.reduce(
      (best, r) => pickRicherLabel(best, r.label_bg.trim()),
      group[0]!.label_bg.trim(),
    );
    const winner =
      group.find((r) => r.label_bg.trim() === canonicalLabel) ??
      group.reduce((a, b) => (scoreLabelRichness(b.label_bg) > scoreLabelRichness(a.label_bg) ? b : a));
    const mergedSlugs = [...new Set(group.map((r) => r.slug.trim()).filter(Boolean))];
    const icon = group.find((r) => r.icon)?.icon ?? winner.icon;
    merged.push({
      slug: winner.slug.trim(),
      label_bg: canonicalLabel,
      icon,
      mergedSlugs,
    });
  }

  merged.sort((a, b) => a.label_bg.localeCompare(b.label_bg, 'bg'));
  return merged.slice(0, MAX_CATEGORY_SUGGESTIONS);
}

/**
 * Map a draft category slug to the canonical slug after merge (identity if unknown).
 */
export function resolveCanonicalCategorySlug(
  slug: string,
  merged: MergedCategorySuggestion[],
): string {
  const t = slug.trim();
  if (!t) return slug;
  for (const m of merged) {
    if (m.mergedSlugs.includes(t)) return m.slug;
  }
  return t;
}
