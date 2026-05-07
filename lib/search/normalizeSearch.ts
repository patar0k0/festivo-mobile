/** Unicode dashes and minus → space */
const DASH_VARIANTS = /[\u002D\u2013\u2014\u2212]+/g;

/** Common Bulgarian / typographic quotes → removed */
const QUOTE_CHARS = /[\u201E\u201C\u201D\u201A\u2018\u2019\u00AB\u00BB\u0022\u0027]/g;

const MULTISPACE = /\s+/g;

function stripCombiningMarks(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Normalizes user query and festival text for deterministic matching.
 * Example: `"  Джаз-Фест  "` → `"джаз фест"`
 */
export function normalizeSearchText(text: string): string {
  let s = text.trim().toLowerCase();
  s = s.replace(DASH_VARIANTS, ' ');
  s = s.replace(QUOTE_CHARS, '');
  s = s.replace(MULTISPACE, ' ').trim();
  s = stripCombiningMarks(s);
  s = s.replace(MULTISPACE, ' ').trim();
  return s;
}
