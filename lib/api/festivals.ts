import { apiFetch } from './client';

export type GetFestivalsParams = {
  page?: number | string;
  city?: string;
  category?: string;
  saved?: boolean;
  limit?: number;
  startDate?: string;
  endDate?: string;
  sort?: 'trending' | 'popular';
  when?: 'this_week';
};

export type FestivalListItem = {
  festivalId: string;
  slug: string;
  title: string;
  city: string;
  start_date: string;
  end_date?: string;
  image_url?: string | null;
  saved: boolean;
};

export type FestivalDetail = {
  festivalId: string;
  slug: string;
  title: string;
  description: string;
  city: string;
  start_date: string;
  end_date?: string;
  saved: boolean;
  /** Cover / hero URL when API provides images */
  image_url?: string | null;
  /** Gallery URLs (detail payload `images[]`) */
  gallery_urls?: string[];
  organizer_name?: string;
  start_time?: string | null;
  end_time?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseListItem(raw: unknown): FestivalListItem | null {
  const o = asRecord(raw);
  if (!o) return null;
  const festivalId = String(o.festivalId ?? o.festival_id ?? o.id ?? '');
  const slug = String(o.slug ?? '');
  const title = String(o.title ?? '');
  if (!festivalId || !slug || !title) return null;
  const endRaw = o.end_date ?? o.endDate;
  const imageRaw = o.image_url ?? o.imageUrl;
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
  };
}

function parseDetail(raw: unknown, fallbackSlug: string): FestivalDetail {
  const o = asRecord(raw) ?? {};
  const dates = asRecord(o.dates);

  const festivalId = String(o.festivalId ?? o.festival_id ?? o.id ?? '');
  const slug = String(o.slug ?? fallbackSlug);
  const title = String(o.title ?? '');
  const description = String(o.description ?? '');
  const city = String(o.city ?? '');

  const startRaw = o.start_date ?? o.startDate ?? dates?.start_date ?? dates?.startDate;
  const start_date = startRaw != null ? String(startRaw) : '';

  const endRaw = o.end_date ?? o.endDate ?? dates?.end_date ?? dates?.endDate;
  const end_date =
    endRaw != null && String(endRaw).trim() ? String(endRaw) : undefined;

  const start_time =
    dates?.start_time != null
      ? String(dates.start_time)
      : o.start_time != null
        ? String(o.start_time)
        : null;
  const end_time =
    dates?.end_time != null
      ? String(dates.end_time)
      : o.end_time != null
        ? String(o.end_time)
        : null;

  const gallery_urls: string[] = [];
  if (Array.isArray(o.images)) {
    for (const img of o.images) {
      const r = asRecord(img);
      const u = r?.url;
      if (typeof u === 'string' && u.trim()) {
        gallery_urls.push(u.trim());
      }
    }
  }

  const imageRaw = o.image_url ?? o.imageUrl;
  let image_url: string | null =
    typeof imageRaw === 'string' && imageRaw.trim()
      ? imageRaw.trim()
      : imageRaw != null
        ? String(imageRaw)
        : null;
  if (!image_url && gallery_urls.length > 0) {
    image_url = gallery_urls[0];
  }

  const org = asRecord(o.organizer);
  const organizer_name =
    org?.name != null && String(org.name).trim() ? String(org.name) : undefined;

  return {
    festivalId,
    slug,
    title,
    description,
    city,
    start_date,
    end_date,
    saved: Boolean(o.saved ?? o.is_saved ?? o.isSaved),
    image_url,
    gallery_urls: gallery_urls.length > 0 ? gallery_urls : undefined,
    organizer_name,
    start_time: start_time?.trim() ? start_time : null,
    end_time: end_time?.trim() ? end_time : null,
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

export async function getFestivals(params?: GetFestivalsParams): Promise<FestivalListItem[]> {
  const search = new URLSearchParams();
  const limit = params?.limit ?? 10;
  search.set('limit', String(limit));
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.city?.trim()) search.set('city', params.city.trim());
  if (params?.category?.trim()) search.set('category', params.category.trim());
  if (params?.sort) search.set('sort', params.sort);
  if (params?.when) search.set('when', params.when);
  if (params?.startDate?.trim()) search.set('from', params.startDate.trim());
  if (params?.endDate?.trim()) search.set('to', params.endDate.trim());

  const qs = search.toString();
  const path = `/api/mobile/festivals?${qs}`;
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
  const record = asRecord(body);
  const rawList = Array.isArray(body)
    ? body
    : Array.isArray(record?.festivals)
      ? record.festivals
      : Array.isArray(record?.data)
        ? record.data
        : [];
  if (!Array.isArray(rawList)) return [];
  return rawList.map(parseListItem).filter((x): x is FestivalListItem => x != null);
}

export async function getFestival(slug: string): Promise<FestivalDetail> {
  const path = `/api/mobile/festivals/${encodeURIComponent(slug)}`;
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
  return parseDetail(payload, slug);
}

/** Alias for detail prefetch / readability; same contract as {@link getFestival}. */
export async function getFestivalBySlug(slug: string): Promise<FestivalDetail> {
  return getFestival(slug);
}
