import { apiFetch } from "@/lib/api/client";
import type { FestivalListItem } from "@/lib/api/festivals";

export type FollowFeedExplanation = {
  code: string;
  label: string;
  label_bg: string;
  params?: Record<string, string>;
};

export type FollowFeedItem = {
  activity_type: "new_festival" | "trending" | "promoted" | "updated" | "starting_soon";
  festival: FestivalListItem | null;
  organizer?: { id?: string | null; slug?: string | null; name?: string | null } | null;
  explanation: FollowFeedExplanation;
  social_proof?: {
    save_count?: number;
    organizer_follower_count?: number;
    trending_rank?: number | null;
    weekly_views?: number;
  };
};

export type FollowFeedOrganizerGroup = {
  organizer_id: string;
  organizer_slug?: string | null;
  organizer_name: string | null;
  follower_count: number;
  item_count: number;
};

export type FollowFeedPage = {
  items: FollowFeedItem[];
  organizers: FollowFeedOrganizerGroup[];
  next_cursor: string | null;
  has_more: boolean;
};

function notNull<T>(value: T | null): value is T {
  return value != null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseFestival(raw: unknown): FestivalListItem | null {
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
    lat: typeof rec.lat === "number" ? rec.lat : undefined,
    lng: typeof rec.lng === "number" ? rec.lng : undefined,
  };
}

export async function getFollowFeed(cursor?: string | null, limit = 12): Promise<FollowFeedPage> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.max(1, Math.floor(limit))));
  if (cursor) params.set("cursor", cursor);
  const res = await apiFetch(`/api/mobile/follow-feed?${params.toString()}`);
  if (!res.ok) return { items: [], organizers: [], next_cursor: null, has_more: false };
  const body = (await res.json()) as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const rawOrganizers = Array.isArray(body.organizers) ? body.organizers : [];

  const items = rawItems
    .map<FollowFeedItem | null>((raw) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const activity_type = rec.activity_type;
      if (
        activity_type !== "new_festival" &&
        activity_type !== "trending" &&
        activity_type !== "promoted" &&
        activity_type !== "updated" &&
        activity_type !== "starting_soon"
      ) {
        return null;
      }
      const explanationRec = asRecord(rec.explanation);
      const proof = asRecord(rec.social_proof);
      return {
        activity_type,
        festival: parseFestival(rec.festival),
        organizer: (() => {
          const org = asRecord(rec.organizer);
          if (!org) return null;
          return {
            id: typeof org.id === "string" ? org.id : null,
            slug: typeof org.slug === "string" ? org.slug : null,
            name: typeof org.name === "string" ? org.name : null,
          };
        })(),
        explanation: {
          code: String(explanationRec?.code ?? "unknown"),
          label: String(explanationRec?.label ?? ""),
          label_bg: String(explanationRec?.label_bg ?? explanationRec?.label ?? ""),
          params: (explanationRec?.params as Record<string, string> | undefined) ?? undefined,
        },
        social_proof: proof
          ? {
              save_count: typeof proof.save_count === "number" ? proof.save_count : undefined,
              organizer_follower_count:
                typeof proof.organizer_follower_count === "number" ? proof.organizer_follower_count : undefined,
              trending_rank:
                typeof proof.trending_rank === "number" || proof.trending_rank == null
                  ? (proof.trending_rank as number | null)
                  : null,
              weekly_views: typeof proof.weekly_views === "number" ? proof.weekly_views : undefined,
            }
          : undefined,
      } satisfies FollowFeedItem;
    })
    .filter((item): item is FollowFeedItem => item != null && item.festival != null);

  const organizers = rawOrganizers
    .map<FollowFeedOrganizerGroup | null>((raw) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const organizerId = String(rec.organizer_id ?? "").trim();
      if (!organizerId) return null;
      return {
        organizer_id: organizerId,
        organizer_slug: typeof rec.organizer_slug === "string" ? rec.organizer_slug : null,
        organizer_name: typeof rec.organizer_name === "string" ? rec.organizer_name : null,
        follower_count: typeof rec.follower_count === "number" ? rec.follower_count : 0,
        item_count: typeof rec.item_count === "number" ? rec.item_count : 0,
      };
    })
    .filter(notNull);

  return {
    items,
    organizers,
    next_cursor: typeof body.next_cursor === "string" ? body.next_cursor : null,
    has_more: Boolean(body.has_more),
  };
}
