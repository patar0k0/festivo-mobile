import { apiFetch } from './client';
import type { FestivalListItem } from './festivals';

export type OrganizerDetail = {
  slug: string;
  name: string;
  city?: string;
  description?: string;
  logo_url?: string | null;
  cover_image_url?: string | null;
  links?: {
    website?: string;
    facebook?: string;
    instagram?: string;
    tiktok?: string;
  };
  festivals: FestivalListItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseFestivalListItem(raw: unknown): FestivalListItem | null {
  const o = asRecord(raw);
  if (!o) return null;

  const festivalId = String(o.festivalId ?? o.festival_id ?? o.id ?? '');
  const slug = String(o.slug ?? '');
  const title = String(o.title ?? '');
  if (!festivalId || !slug || !title) return null;

  const imageRaw = o.image_url ?? o.imageUrl;
  const endRaw = o.end_date ?? o.endDate;

  return {
    festivalId,
    slug,
    title,
    city: String(o.city ?? ''),
    start_date: String(o.start_date ?? o.startDate ?? ''),
    end_date: endRaw != null && String(endRaw).trim() ? String(endRaw) : undefined,
    image_url:
      typeof imageRaw === 'string' && imageRaw.trim()
        ? imageRaw.trim()
        : imageRaw != null
          ? String(imageRaw)
          : null,
    saved: Boolean(o.saved ?? o.is_saved ?? o.isSaved),
    organizer_name:
      typeof o.organizer_name === 'string' && o.organizer_name.trim()
        ? o.organizer_name.trim()
        : undefined,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function getOrganizerBySlug(slug: string): Promise<OrganizerDetail> {
  const path = `/api/mobile/organizers/${encodeURIComponent(slug)}`;
  const res = await apiFetch(path);
  if (!res.ok) {
    const body = await readJson(res);
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  const body = await readJson(res);
  const payload = asRecord(body)?.data ?? body;
  const data = asRecord(payload) ?? {};
  const organizer = asRecord(data.organizer) ?? data;

  const linksRaw = asRecord(organizer.links);
  const festivalsRaw = Array.isArray(data.festivals) ? data.festivals : [];
  const festivals = festivalsRaw
    .map((item) => parseFestivalListItem(item))
    .filter((item): item is FestivalListItem => item != null);

  return {
    slug: String(organizer.slug ?? slug),
    name: String(organizer.name ?? ''),
    city:
      optionalTrimmedString(organizer.city) ??
      optionalTrimmedString(organizer.city_name) ??
      optionalTrimmedString(organizer.cityName) ??
      optionalTrimmedString(organizer.city_display) ??
      optionalTrimmedString(organizer.cityDisplay),
    description: optionalTrimmedString(organizer.description),
    logo_url:
      optionalTrimmedString(organizer.logo_url) ??
      optionalTrimmedString(organizer.logoUrl) ??
      null,
    cover_image_url:
      optionalTrimmedString(organizer.cover_image_url) ??
      optionalTrimmedString(organizer.coverImageUrl) ??
      null,
    links: {
      website:
        optionalTrimmedString(linksRaw?.website) ??
        optionalTrimmedString(organizer.website_url) ??
        optionalTrimmedString(organizer.websiteUrl),
      facebook:
        optionalTrimmedString(linksRaw?.facebook) ??
        optionalTrimmedString(organizer.facebook_url) ??
        optionalTrimmedString(organizer.facebookUrl),
      instagram:
        optionalTrimmedString(linksRaw?.instagram) ??
        optionalTrimmedString(organizer.instagram_url) ??
        optionalTrimmedString(organizer.instagramUrl),
      tiktok:
        optionalTrimmedString(linksRaw?.tiktok) ??
        optionalTrimmedString(organizer.tiktok_url) ??
        optionalTrimmedString(organizer.tiktokUrl),
    },
    festivals,
  };
}
