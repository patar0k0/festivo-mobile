import type { FestivalListItem } from '@/lib/api/festivals';

import { normalizeSearchText } from '@/lib/search/normalizeSearch';

export type SearchRankingOptions = {
  /** Override clock (tests). */
  now?: Date;
};

type Scored = {
  item: FestivalListItem;
  score: number;
  savesTie: number;
  startTs: number;
  titleSort: string;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeekSunday(ref: Date): Date {
  const start = startOfWeekMonday(ref);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

function parseLocalDayTime(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalDay(d).getTime();
}

/** Last calendar day of the event (end_date or start_date), as end-of-local-day timestamp for comparison. */
function eventEndLocalEodMs(item: FestivalListItem): number | null {
  const raw = item.end_date?.trim() ? item.end_date : item.start_date;
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const day = startOfLocalDay(d);
  day.setHours(23, 59, 59, 999);
  return day.getTime();
}

function isPastEvent(item: FestivalListItem, now: Date): boolean {
  const endMs = eventEndLocalEodMs(item);
  if (endMs == null) return false;
  return endMs < startOfLocalDay(now).getTime();
}

function daysFromTodayToStart(startIso: string, now: Date): number | null {
  const startMs = parseLocalDayTime(startIso);
  if (startMs == null) return null;
  const todayMs = startOfLocalDay(now).getTime();
  return Math.round((startMs - todayMs) / 86_400_000);
}

function isStartThisWeek(item: FestivalListItem, now: Date): boolean {
  const startMs = parseLocalDayTime(item.start_date);
  if (startMs == null) return false;
  const weekStart = startOfWeekMonday(now).getTime();
  const weekEnd = endOfWeekSunday(now).getTime();
  return startMs >= weekStart && startMs <= weekEnd;
}

function computeFreshnessBonus(startIso: string, now: Date): number {
  const d = daysFromTodayToStart(startIso, now);
  if (d == null || d < 0) return 0;
  if (d <= 3) return 20;
  if (d <= 7) return 10;
  if (d <= 30) return 4;
  return 0;
}

function queryTokensFromNorm(normQuery: string): string[] {
  if (!normQuery) return [];
  return normQuery.split(' ').filter(Boolean);
}

/** Tokens of an already-normalized string (split on spaces only). */
function normWordTokens(normText: string): string[] {
  if (!normText) return [];
  return normText.split(' ').filter(Boolean);
}

function tokenSetFromNorm(normText: string): Set<string> {
  const words = normWordTokens(normText);
  return words.length === 0 ? new Set() : new Set(words);
}

/**
 * True if any query token equals a whole word in normalized text (space-delimited).
 */
export function containsWholeWord(text: string, query: string): boolean {
  const normText = normalizeSearchText(text);
  const qTok = queryTokensFromNorm(normalizeSearchText(query));
  return containsWholeWordNorm(normText, qTok);
}

function containsWholeWordNorm(normText: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0 || !normText) return false;
  const fieldTokens = tokenSetFromNorm(normText);
  for (let i = 0; i < queryTokens.length; i++) {
    if (fieldTokens.has(queryTokens[i])) return true;
  }
  return false;
}

function categoryNormTokenSet(item: FestivalListItem): Set<string> {
  const extra = item.category?.trim() ? [item.category.trim()] : [];
  const cats = item.categories ?? [];
  const tags = item.tags ?? [];
  const out = new Set<string>();
  for (let i = 0; i < extra.length; i++) {
    const w = normWordTokens(normalizeSearchText(extra[i]));
    for (let j = 0; j < w.length; j++) out.add(w[j]);
  }
  for (let i = 0; i < cats.length; i++) {
    const w = normWordTokens(normalizeSearchText(cats[i]));
    for (let j = 0; j < w.length; j++) out.add(w[j]);
  }
  for (let i = 0; i < tags.length; i++) {
    const w = normWordTokens(normalizeSearchText(tags[i]));
    for (let j = 0; j < w.length; j++) out.add(w[j]);
  }
  return out;
}

function categoryOrTagMatch(normQuery: string, item: FestivalListItem): boolean {
  const extra = item.category?.trim() ? [item.category.trim()] : [];
  const cats = [...(item.categories ?? []), ...extra];
  const tags = item.tags ?? [];
  for (let i = 0; i < cats.length; i++) {
    const p = normalizeSearchText(cats[i]);
    if (p && (p === normQuery || p.includes(normQuery))) return true;
  }
  for (let i = 0; i < tags.length; i++) {
    const p = normalizeSearchText(tags[i]);
    if (p && (p === normQuery || p.includes(normQuery))) return true;
  }
  return false;
}

function organizerMatch(normQuery: string, item: FestivalListItem): boolean {
  const name = item.organizer_name?.trim();
  if (!name) return false;
  const n = normalizeSearchText(name);
  return n === normQuery || n.includes(normQuery);
}

function trendingBonus(item: FestivalListItem): number {
  const c = item.saves_count;
  if (c == null || !Number.isFinite(c) || c <= 0) return 0;
  const clamped = Math.min(Math.max(0, c), 100);
  return Math.floor(clamped / 5);
}

type TokenMatchResult = { bonus: number; matchedCount: number };

function scoreTokenMatches(
  queryTokens: string[],
  titleTok: Set<string>,
  cityTok: Set<string>,
  orgTok: Set<string>,
  catTok: Set<string>,
): TokenMatchResult {
  let bonus = 0;
  let matchedCount = 0;
  for (let i = 0; i < queryTokens.length; i++) {
    const t = queryTokens[i];
    let hit = false;
    if (titleTok.has(t)) {
      bonus += 12;
      hit = true;
    }
    if (cityTok.has(t)) {
      bonus += 7;
      hit = true;
    }
    if (orgTok.has(t)) {
      bonus += 5;
      hit = true;
    }
    if (catTok.has(t)) {
      bonus += 4;
      hit = true;
    }
    if (hit) matchedCount += 1;
  }
  return { bonus, matchedCount };
}

function applyMissingTokenPenalty(score: number, queryTokens: string[], matchedCount: number): number {
  if (queryTokens.length <= 1) return score;
  const unmatched = queryTokens.length - matchedCount;
  if (unmatched <= 0) return score;
  const rawPenalty = unmatched * 6;
  const sBefore = score;
  return sBefore - Math.min(rawPenalty, Math.max(0, sBefore));
}

function scoreItem(item: FestivalListItem, normQuery: string, now: Date): number {
  if (!normQuery) return 0;

  const queryTokens = queryTokensFromNorm(normQuery);
  const shortQuery = normQuery.length < 3;
  const titleContainsPts = shortQuery ? 35 : 70;
  const cityContainsPts = shortQuery ? 15 : 30;

  let score = 0;

  // Future signals (reserved — do not implement yet):
  // score += personalizationWeight;
  // score += notificationEngagement;
  // score += cityAffinity;

  if (isPastEvent(item, now)) {
    score -= 1000;
  }

  const titleNorm = normalizeSearchText(item.title);
  if (titleNorm === normQuery) {
    score += 120;
  } else if (titleNorm.startsWith(normQuery)) {
    score += 90;
  } else if (titleNorm.includes(normQuery)) {
    score += titleContainsPts;
  }

  score += Math.max(0, 12 - titleNorm.length / 10);

  const cityNorm = normalizeSearchText(item.city ?? '');
  if (cityNorm && cityNorm === normQuery) {
    score += 50;
  } else if (cityNorm && normQuery.length >= 2 && cityNorm.includes(normQuery)) {
    score += cityContainsPts;
  }

  if (organizerMatch(normQuery, item)) {
    score += 25;
  }

  if (categoryOrTagMatch(normQuery, item)) {
    score += 20;
  }

  const orgNorm = item.organizer_name?.trim() ? normalizeSearchText(item.organizer_name.trim()) : '';
  const catTok = categoryNormTokenSet(item);

  if (containsWholeWordNorm(titleNorm, queryTokens)) {
    score += 18;
  }
  if (orgNorm && containsWholeWordNorm(orgNorm, queryTokens)) {
    score += 18;
  }
  if (catTok.size > 0) {
    let catWhole = false;
    for (let i = 0; i < queryTokens.length; i++) {
      if (catTok.has(queryTokens[i])) {
        catWhole = true;
        break;
      }
    }
    if (catWhole) {
      score += 18;
    }
  }

  const titleTok = tokenSetFromNorm(titleNorm);
  const cityTok = tokenSetFromNorm(cityNorm);
  const orgTok = orgNorm ? tokenSetFromNorm(orgNorm) : new Set<string>();

  const { bonus: tokenBonus, matchedCount } = scoreTokenMatches(
    queryTokens,
    titleTok,
    cityTok,
    orgTok,
    catTok,
  );
  score += tokenBonus;

  score = applyMissingTokenPenalty(score, queryTokens, matchedCount);

  score += trendingBonus(item);

  if (isStartThisWeek(item, now)) {
    score += 20;
  }

  if (item.image_url?.trim()) {
    score += 8;
  }

  if (item.is_verified || item.is_vip) {
    score += 10;
  }

  score += computeFreshnessBonus(item.start_date, now);

  return score;
}

function startTsForTie(item: FestivalListItem): number {
  const ms = parseLocalDayTime(item.start_date);
  return ms ?? Number.POSITIVE_INFINITY;
}

/**
 * Client-side relevance ranking. O(n) scoring per item, O(n log n) sort.
 * Deterministic tie-breaks: saves_count → earlier start_date → title (bg locale).
 */
export function rankSearchResults(
  results: FestivalListItem[],
  query: string,
  options?: SearchRankingOptions,
): FestivalListItem[] {
  const normQuery = normalizeSearchText(query);
  if (!normQuery || results.length === 0) {
    return [...results];
  }

  const now = options?.now ?? new Date();

  const scored: Scored[] = results.map((item) => ({
    item,
    score: scoreItem(item, normQuery, now),
    savesTie: Math.max(0, Math.floor(item.saves_count ?? 0)),
    startTs: startTsForTie(item),
    titleSort: item.title.trim().toLowerCase(),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.savesTie !== a.savesTie) return b.savesTie - a.savesTie;
    if (a.startTs !== b.startTs) return a.startTs - b.startTs;
    return a.titleSort.localeCompare(b.titleSort, 'bg');
  });

  return scored.map((s) => s.item);
}
