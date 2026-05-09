import type { FestivalListItem } from "@/lib/api/festivals";
import { apiFetch } from "@/lib/api/client";
import { debugLogError, debugLogRare, debugLogWarn } from "@/lib/debug/mobileDiagnosticsHelpers";

export type PersonalizedSection = {
  key: "for_you" | "near_you" | "trending" | "this_weekend" | "from_followed_organizers";
  title: string;
  items: FestivalListItem[];
};

type ResponseShape = {
  sections?: PersonalizedSection[];
};

const SLOW_RECOMMENDATIONS_MS = 1500;
const emptySectionStreakByKey = new Map<string, number>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseListItem(raw: unknown): FestivalListItem | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const festivalId = String(rec.festivalId ?? rec.festival_id ?? rec.id ?? "");
  const slug = String(rec.slug ?? "");
  const title = String(rec.title ?? "");
  if (!festivalId || !slug || !title) return null;
  return {
    festivalId,
    slug,
    title,
    city: String(rec.city ?? ""),
    start_date: String(rec.start_date ?? ""),
    end_date: typeof rec.end_date === "string" ? rec.end_date : undefined,
    image_url: typeof rec.image_url === "string" ? rec.image_url : null,
    saved: Boolean(rec.saved ?? rec.is_saved),
    organizer_name: typeof rec.organizer_name === "string" ? rec.organizer_name : undefined,
    category: typeof rec.category === "string" ? rec.category : undefined,
    is_promoted: Boolean(rec.is_promoted) || undefined,
    is_verified: Boolean(rec.is_verified) || undefined,
  };
}

export async function getPersonalizedSections(page = 1): Promise<PersonalizedSection[]> {
  const startedAt = Date.now();
  const safePage = Math.max(1, Math.floor(page));
  try {
    const res = await apiFetch(`/api/mobile/recommendations?page=${safePage}`);
    if (!res.ok) {
      debugLogWarn({
        type: "recommendations_fetch_error",
        scope: "recommendations",
        message: "Personalized recommendations returned a non-OK status.",
        meta: { page: safePage, status: res.status, durationMs: Date.now() - startedAt },
      });
      return [];
    }
    const body = (await res.json()) as ResponseShape;
    const sections = Array.isArray(body.sections) ? body.sections : [];
    const parsed = sections.map((section) => ({
      ...section,
      items: Array.isArray(section.items)
        ? section.items.map(parseListItem).filter((x): x is FestivalListItem => x != null)
        : [],
    }));
    for (const section of parsed) {
      if (section.items.length === 0) {
        const nextEmptyCount = (emptySectionStreakByKey.get(section.key) ?? 0) + 1;
        emptySectionStreakByKey.set(section.key, nextEmptyCount);
        if (nextEmptyCount >= 3) {
          debugLogRare(`recommendations_empty_section:${section.key}`, {
            type: "recommendations_empty_section",
            scope: "recommendations",
            message: "Personalized recommendations section stayed empty across repeated fetches.",
            meta: { page: safePage, sectionKey: section.key, title: section.title, consecutiveEmptyCount: nextEmptyCount },
          });
        }
      } else {
        emptySectionStreakByKey.set(section.key, 0);
      }
    }
    const nonEmpty = parsed.filter((section) => section.items.length > 0);
    if (sections.length === 0) {
      const noSectionsKey = "no_sections";
      const nextEmptyCount = (emptySectionStreakByKey.get(noSectionsKey) ?? 0) + 1;
      emptySectionStreakByKey.set(noSectionsKey, nextEmptyCount);
      if (nextEmptyCount >= 3) {
        debugLogRare(`recommendations_empty_section:${noSectionsKey}`, {
          type: "recommendations_empty_section",
          scope: "recommendations",
          message: "Personalized recommendations response repeatedly had no sections.",
          meta: { page: safePage, sectionKey: noSectionsKey, consecutiveEmptyCount: nextEmptyCount },
        });
      }
    } else {
      emptySectionStreakByKey.set("no_sections", 0);
    }
    const durationMs = Date.now() - startedAt;
    if (durationMs > SLOW_RECOMMENDATIONS_MS || nonEmpty.length === 0) {
      debugLogRare(`recommendations_fetch_success:${safePage}:${nonEmpty.length === 0 ? "empty" : "slow"}`, {
        type: "recommendations_fetch_success",
        scope: "recommendations",
        message: "Personalized recommendations fetch completed with notable latency or no sections.",
        meta: {
          page: safePage,
          durationMs,
          sectionCount: nonEmpty.length,
          itemCount: nonEmpty.reduce((sum, section) => sum + section.items.length, 0),
          emptySectionCount: parsed.length - nonEmpty.length,
        },
      });
    }
    return nonEmpty;
  } catch (error) {
    debugLogError({
      type: "recommendations_fetch_error",
      scope: "recommendations",
      message: "Personalized recommendations fetch failed.",
      meta: { page: safePage, durationMs: Date.now() - startedAt, error },
    });
    throw error;
  }
}
