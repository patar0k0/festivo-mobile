import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FestivalListItem } from "@/lib/api/festivals";

const STORAGE_KEY = "festivo.recentlyViewed.v1";
const MAX_ITEMS = 24;
const HALF_LIFE_DAYS = 21;

export type RecentlyViewedFestival = FestivalListItem & {
  viewed_at: string;
  recency_weight: number;
};

function toIsoNow(): string {
  return new Date().toISOString();
}

function recencyWeight(iso: string): number {
  const viewedMs = Date.parse(iso);
  if (!Number.isFinite(viewedMs)) return 0;
  const days = Math.max(0, (Date.now() - viewedMs) / 86_400_000);
  return Math.exp((-Math.log(2) * days) / HALF_LIFE_DAYS);
}

function parseStored(raw: unknown): RecentlyViewedFestival[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentlyViewedFestival[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const festivalId = String(rec.festivalId ?? "");
    const slug = String(rec.slug ?? "");
    const title = String(rec.title ?? "");
    if (!festivalId || !slug || !title) continue;
    const viewedAt = typeof rec.viewed_at === "string" ? rec.viewed_at : toIsoNow();
    out.push({
      festivalId,
      slug,
      title,
      city: String(rec.city ?? ""),
      start_date: String(rec.start_date ?? ""),
      end_date: typeof rec.end_date === "string" ? rec.end_date : undefined,
      image_url: typeof rec.image_url === "string" ? rec.image_url : null,
      saved: Boolean(rec.saved),
      viewed_at: viewedAt,
      recency_weight: recencyWeight(viewedAt),
    });
  }
  return out
    .sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))
    .slice(0, MAX_ITEMS);
}

export async function getRecentlyViewedFestivals(limit = 8): Promise<RecentlyViewedFestival[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = parseStored(JSON.parse(raw));
    return parsed.slice(0, Math.max(1, Math.floor(limit)));
  } catch {
    return [];
  }
}

export async function trackRecentlyViewedFestival(festival: FestivalListItem): Promise<void> {
  try {
    const current = await getRecentlyViewedFestivals(MAX_ITEMS);
    const next: RecentlyViewedFestival[] = [
      { ...festival, viewed_at: toIsoNow(), recency_weight: 1 },
      ...current.filter((row) => row.festivalId !== festival.festivalId),
    ].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore local persistence failure
  }
}
