import type { FestivalListItem } from "@/lib/api/festivals";
import { apiFetch } from "@/lib/api/client";

export type PersonalizedSection = {
  key: "for_you" | "near_you" | "trending" | "this_weekend" | "from_followed_organizers";
  title: string;
  items: FestivalListItem[];
};

type ResponseShape = {
  sections?: PersonalizedSection[];
};

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
  const res = await apiFetch(`/api/mobile/recommendations?page=${Math.max(1, Math.floor(page))}`);
  if (!res.ok) return [];
  const body = (await res.json()) as ResponseShape;
  const sections = Array.isArray(body.sections) ? body.sections : [];
  return sections
    .map((section) => ({
      ...section,
      items: Array.isArray(section.items)
        ? section.items.map(parseListItem).filter((x): x is FestivalListItem => x != null)
        : [],
    }))
    .filter((section) => section.items.length > 0);
}
