import { apiFetch } from './client';
import type { FestivalListItem } from './festivals';

export type OrganizerDetail = {
  slug: string;
  name: string;
  city?: string;
  description?: string;
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

  const linksRaw = asRecord(data.links);
  const festivalsRaw = Array.isArray(data.festivals) ? data.festivals : [];
  const festivals = festivalsRaw
    .map((item) => parseFestivalListItem(item))
    .filter((item): item is FestivalListItem => item != null);

  return {
    slug: String(data.slug ?? slug),
    name: String(data.name ?? ''),
    city: typeof data.city === 'string' && data.city.trim() ? data.city.trim() : undefined,
    description:
      typeof data.description === 'string' && data.description.trim()
        ? data.description.trim()
        : undefined,
    cover_image_url:
      typeof data.cover_image_url === 'string' && data.cover_image_url.trim()
        ? data.cover_image_url.trim()
        : typeof data.coverImageUrl === 'string' && data.coverImageUrl.trim()
          ? data.coverImageUrl.trim()
          : null,
    links: linksRaw
      ? {
          website:
            typeof linksRaw.website === 'string' && linksRaw.website.trim()
              ? linksRaw.website.trim()
              : undefined,
          facebook:
            typeof linksRaw.facebook === 'string' && linksRaw.facebook.trim()
              ? linksRaw.facebook.trim()
              : undefined,
          instagram:
            typeof linksRaw.instagram === 'string' && linksRaw.instagram.trim()
              ? linksRaw.instagram.trim()
              : undefined,
          tiktok:
            typeof linksRaw.tiktok === 'string' && linksRaw.tiktok.trim()
              ? linksRaw.tiktok.trim()
              : undefined,
        }
      : undefined,
    festivals,
  };
}
