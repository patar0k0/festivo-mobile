import { apiFetch } from './client';
import type {
  MobileFestivalScheduleDto,
  MobileScheduleDayDto,
  MobileScheduleItemDto,
} from '@/lib/api/mobileScheduleDto';

export type GetFestivalsParams = {
  page?: number | string;
  city?: string;
  category?: string;
  /** Full-text search (mobile listing `q`) */
  q?: string;
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
  /** Optional listing fields for client-side search ranking when API provides them. */
  saves_count?: number;
  organizer_name?: string;
  category?: string;
  categories?: string[];
  tags?: string[];
  is_verified?: boolean;
  is_vip?: boolean;
  is_promoted?: boolean;
  /** Map markers — WGS84 when API provides coordinates */
  lat?: number;
  lng?: number;
  /** Client-only: home feed planner coherence hint (not from API). */
  planner_recency_hint?: string;
};

export type FestivalScheduleDay = {
  id: string;
  festival_id?: string;
  date: string;
  title?: string | null;
};

export type FestivalScheduleItem = {
  id: string;
  day_id?: string | null;
  title: string;
  description?: string | null;
  /** ISO-8601 UTC instant from Europe/Sofia wall time (canonical DTO). */
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean;
  /** Maps DTO `venue`; also exposed as `stage` for UI helpers. */
  venue?: string | null;
  category?: string | null;
  tags?: string[];
  organizer_name?: string | null;
  image_url?: string | null;
  is_cancelled?: boolean;
  sort_index?: number;
  /** Legacy HH:mm from older payloads; prefer `starts_at` / `ends_at`. */
  start_time?: string | null;
  end_time?: string | null;
  /** Alias of `venue` for compact cards. */
  stage?: string | null;
  sort_order?: number | null;
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
  liked: boolean;
  likes_count: number;
  /** Cover / hero URL when API provides images */
  image_url?: string | null;
  /** Gallery URLs (detail payload `images[]`) */
  gallery_urls?: string[];
  organizer_name?: string;
  organizer?: {
    slug?: string;
    name?: string;
    id?: string;
    logo_url?: string | null;
    verified?: boolean | null;
  };
  start_time?: string | null;
  end_time?: string | null;
  category?: string;
  tags?: string[];
  is_verified?: boolean;
  is_promoted?: boolean;
  location?: {
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    location_name?: string | null;
    place_id?: string | null;
  };
  /** Canonical nested program DTO from `GET /api/mobile/festivals/[slug]`. */
  schedule?: MobileFestivalScheduleDto;
  /** Flattened days (derived from `schedule` or legacy fields). */
  schedule_days?: FestivalScheduleDay[];
  schedule_items?: FestivalScheduleItem[];
};

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseOptionalCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseFloat(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function optionalNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseScheduleDay(raw: unknown): FestivalScheduleDay | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = String(rec.id ?? rec.day_id ?? '').trim();
  const date = String(rec.date ?? rec.day_date ?? '').trim();
  if (!id || !date) return null;
  return {
    id,
    festival_id: optionalTrimmedString(rec.festival_id ?? rec.festivalId),
    date,
    title: optionalNullableString(rec.title),
  };
}

function parseScheduleItem(raw: unknown): FestivalScheduleItem | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = String(rec.id ?? rec.schedule_item_id ?? rec.scheduleItemId ?? '').trim();
  const title = String(rec.title ?? '').trim();
  if (!id || !title) return null;
  const venue = optionalNullableString(rec.venue ?? rec.stage);
  const sortIdx =
    typeof rec.sort_index === 'number' && Number.isFinite(rec.sort_index)
      ? rec.sort_index
      : parseOptionalNumber(rec.sort_order ?? rec.sortOrder);
  return {
    id,
    day_id: optionalNullableString(rec.day_id ?? rec.dayId),
    title,
    description: optionalNullableString(rec.description),
    starts_at: optionalNullableString(rec.starts_at ?? rec.startsAt),
    ends_at: optionalNullableString(rec.ends_at ?? rec.endsAt),
    all_day: typeof rec.all_day === 'boolean' ? rec.all_day : typeof rec.allDay === 'boolean' ? rec.allDay : undefined,
    venue,
    category: optionalNullableString(rec.category),
    organizer_name: optionalNullableString(rec.organizer_name ?? rec.organizerName),
    image_url: optionalNullableString(rec.image_url ?? rec.imageUrl),
    is_cancelled: typeof rec.is_cancelled === 'boolean' ? rec.is_cancelled : undefined,
    sort_index: typeof rec.sort_index === 'number' && Number.isFinite(rec.sort_index) ? rec.sort_index : undefined,
    start_time: optionalNullableString(rec.start_time ?? rec.startTime),
    end_time: optionalNullableString(rec.end_time ?? rec.endTime),
    stage: venue ?? optionalNullableString(rec.stage),
    sort_order: parseOptionalNumber(rec.sort_order ?? rec.sortOrder ?? rec.sort_index ?? rec.sortIndex),
  };
}

function parseMobileScheduleItemDto(raw: unknown): MobileScheduleItemDto | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = String(rec.id ?? '').trim();
  const day_id = String(rec.day_id ?? rec.dayId ?? '').trim();
  const title = String(rec.title ?? '').trim();
  if (!id || !day_id || !title) return null;
  const tagsRaw = Array.isArray(rec.tags) ? rec.tags : [];
  const tags = tagsRaw.map((t) => String(t).trim()).filter(Boolean);
  const sortRaw = rec.sort_index ?? rec.sortIndex;
  return {
    id,
    day_id,
    title,
    description: optionalNullableString(rec.description),
    starts_at: optionalNullableString(rec.starts_at ?? rec.startsAt),
    ends_at: optionalNullableString(rec.ends_at ?? rec.endsAt),
    all_day: Boolean(rec.all_day ?? rec.allDay),
    venue: optionalNullableString(rec.venue),
    category: optionalNullableString(rec.category),
    tags,
    organizer_name: optionalNullableString(rec.organizer_name ?? rec.organizerName),
    image_url: optionalNullableString(rec.image_url ?? rec.imageUrl),
    is_cancelled: Boolean(rec.is_cancelled ?? rec.isCancelled),
    sort_index: typeof sortRaw === 'number' && Number.isFinite(sortRaw) ? sortRaw : 0,
  };
}

function parseMobileScheduleDayDto(raw: unknown): MobileScheduleDayDto | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = String(rec.id ?? '').trim();
  const date = String(rec.date ?? '').trim().slice(0, 10);
  if (!id || !date) return null;
  const itemsRaw = Array.isArray(rec.items) ? rec.items : [];
  const items = itemsRaw.map(parseMobileScheduleItemDto).filter((x): x is MobileScheduleItemDto => x != null);
  return {
    id,
    date,
    title: optionalNullableString(rec.title),
    items,
  };
}

function parseMobileFestivalScheduleDto(raw: unknown): MobileFestivalScheduleDto | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const daysRaw = Array.isArray(rec.days) ? rec.days : [];
  const days = daysRaw.map(parseMobileScheduleDayDto).filter((x): x is MobileScheduleDayDto => x != null);
  return {
    timezone: optionalNullableString(rec.timezone),
    days,
  };
}

function festivalScheduleItemFromDto(it: MobileScheduleItemDto): FestivalScheduleItem {
  const venue = it.venue;
  return {
    id: it.id,
    day_id: it.day_id,
    title: it.title,
    description: it.description,
    starts_at: it.starts_at,
    ends_at: it.ends_at,
    all_day: it.all_day,
    venue,
    category: it.category ?? undefined,
    tags: it.tags.length ? it.tags : undefined,
    organizer_name: it.organizer_name ?? undefined,
    image_url: it.image_url ?? undefined,
    is_cancelled: it.is_cancelled,
    sort_index: it.sort_index,
    stage: venue,
    start_time: null,
    end_time: null,
    sort_order: it.sort_index,
  };
}

function flattenCanonicalSchedule(s: MobileFestivalScheduleDto): {
  schedule_days: FestivalScheduleDay[];
  schedule_items: FestivalScheduleItem[];
} {
  const schedule_days: FestivalScheduleDay[] = s.days.map((d) => ({
    id: d.id,
    date: d.date,
    title: d.title,
  }));
  const schedule_items: FestivalScheduleItem[] = [];
  for (const d of s.days) {
    for (const it of d.items) {
      schedule_items.push(festivalScheduleItemFromDto(it));
    }
  }
  return { schedule_days, schedule_items };
}

function parseScheduleArrays(o: Record<string, unknown>): {
  schedule_days?: FestivalScheduleDay[];
  schedule_items?: FestivalScheduleItem[];
} {
  const schedule = asRecord(o.schedule ?? o.program);
  const daysRaw = Array.isArray(o.days)
    ? o.days
    : Array.isArray(o.schedule_days)
      ? o.schedule_days
      : Array.isArray(o.scheduleDays)
        ? o.scheduleDays
        : Array.isArray(schedule?.days)
          ? schedule.days
          : [];
  const itemsRaw = Array.isArray(o.scheduleItems)
    ? o.scheduleItems
    : Array.isArray(o.schedule_items)
      ? o.schedule_items
      : Array.isArray(schedule?.items)
        ? schedule.items
        : [];
  const days = daysRaw.map(parseScheduleDay).filter((x): x is FestivalScheduleDay => x != null);
  const items = itemsRaw.map(parseScheduleItem).filter((x): x is FestivalScheduleItem => x != null);
  return {
    schedule_days: days.length ? days : undefined,
    schedule_items: items.length ? items : undefined,
  };
}

export function parseListItem(raw: unknown): FestivalListItem | null {
  const o = asRecord(raw);
  if (!o) return null;
  const festivalId = String(o.festivalId ?? o.festival_id ?? o.id ?? '');
  const slug = String(o.slug ?? '');
  const title = String(o.title ?? '');
  if (!festivalId || !slug || !title) return null;
  const endRaw = o.end_date ?? o.endDate;
  const imageRaw = o.image_url ?? o.imageUrl;

  const savesRaw = o.saves_count ?? o.savesCount;
  let saves_count: number | undefined;
  if (typeof savesRaw === 'number' && Number.isFinite(savesRaw)) {
    saves_count = Math.max(0, Math.floor(savesRaw));
  } else if (typeof savesRaw === 'string' && savesRaw.trim()) {
    const n = Number(savesRaw);
    if (Number.isFinite(n)) saves_count = Math.max(0, Math.floor(n));
  }

  const org = asRecord(o.organizer);
  const organizer_name =
    typeof o.organizer_name === 'string' && o.organizer_name.trim()
      ? o.organizer_name.trim()
      : typeof o.organizerName === 'string' && o.organizerName.trim()
        ? o.organizerName.trim()
        : org?.name != null && String(org.name).trim()
          ? String(org.name).trim()
          : undefined;

  const category =
    typeof o.category === 'string' && o.category.trim() ? o.category.trim() : undefined;

  let categories: string[] | undefined;
  if (Array.isArray(o.categories)) {
    const list = o.categories
      .map((x) => (typeof x === 'string' && x.trim() ? x.trim() : null))
      .filter((x): x is string => x != null);
    if (list.length) categories = list;
  }

  let tags: string[] | undefined;
  if (Array.isArray(o.tags)) {
    const list = o.tags
      .map((x) => (typeof x === 'string' && x.trim() ? x.trim() : null))
      .filter((x): x is string => x != null);
    if (list.length) tags = list;
  }

  const is_verified = Boolean(o.is_verified ?? o.verified ?? o.isVerified);
  const is_vip = Boolean(o.is_vip ?? o.vip ?? o.isVip);
  const is_promoted = Boolean(o.is_promoted ?? o.isPromoted);

  const latParsed = parseOptionalCoord(o.lat ?? o.latitude);
  const lngParsed = parseOptionalCoord(o.lng ?? o.longitude);

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
    saves_count,
    organizer_name,
    category,
    categories,
    tags,
    is_verified: is_verified || undefined,
    is_vip: is_vip || undefined,
    is_promoted: is_promoted || undefined,
    lat: latParsed,
    lng: lngParsed,
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
  const organizer_slug =
    org?.slug != null && String(org.slug).trim() ? String(org.slug).trim() : undefined;
  const organizer_id =
    org?.id != null && String(org.id).trim() ? String(org.id).trim() : undefined;
  const organizer_logo =
    org?.logo_url != null && String(org.logo_url).trim()
      ? String(org.logo_url).trim()
      : org?.logoUrl != null && String(org.logoUrl).trim()
        ? String(org.logoUrl).trim()
        : undefined;
  const organizer_verified =
    typeof org?.verified === 'boolean'
      ? org.verified
      : typeof org?.is_verified === 'boolean'
        ? org.is_verified
        : null;

  const loc = asRecord(o.location);
  let location: FestivalDetail['location'];
  if (loc && typeof loc === 'object') {
    const lat = parseOptionalCoord(loc.lat ?? loc.latitude);
    const lng = parseOptionalCoord(loc.lng ?? loc.longitude);
    location = {
      lat: lat ?? null,
      lng: lng ?? null,
      address: optionalTrimmedString(loc.address) ?? null,
      location_name: optionalTrimmedString(loc.location_name ?? loc.locationName) ?? null,
      place_id: optionalTrimmedString(loc.place_id ?? loc.placeId) ?? null,
    };
    if (
      location.lat == null &&
      location.lng == null &&
      !location.address &&
      !location.location_name &&
      !location.place_id
    ) {
      location = undefined;
    }
  }

  const category = optionalTrimmedString(o.category ?? o.category_slug);
  let tags: string[] | undefined;
  if (Array.isArray(o.tags)) {
    const t = o.tags
      .map((x) => (typeof x === 'string' && x.trim() ? x.trim() : null))
      .filter((x): x is string => x != null);
    if (t.length) tags = t;
  }

  const is_verified_detail = Boolean(o.is_verified ?? o.verified ?? o.isVerified);
  const is_promoted_detail = Boolean(o.is_promoted ?? o.isPromoted);
  const legacySchedule = parseScheduleArrays(o);
  const scheduleDto = parseMobileFestivalScheduleDto(o.schedule);
  let schedule: MobileFestivalScheduleDto | undefined;
  let schedule_days = legacySchedule.schedule_days;
  let schedule_items = legacySchedule.schedule_items;
  if (scheduleDto && scheduleDto.days.length > 0) {
    schedule = scheduleDto;
    const flat = flattenCanonicalSchedule(scheduleDto);
    if (flat.schedule_days.length) schedule_days = flat.schedule_days;
    if (flat.schedule_items.length) schedule_items = flat.schedule_items;
  }

  const likesRaw = o.likes_count ?? o.likesCount;
  let likes_count = 0;
  if (typeof likesRaw === 'number' && Number.isFinite(likesRaw)) {
    likes_count = Math.max(0, Math.floor(likesRaw));
  } else if (typeof likesRaw === 'string' && likesRaw.trim()) {
    const n = Number(likesRaw);
    if (Number.isFinite(n)) likes_count = Math.max(0, Math.floor(n));
  }

  return {
    festivalId,
    slug,
    title,
    description,
    city,
    start_date,
    end_date,
    saved: Boolean(o.saved ?? o.is_saved ?? o.isSaved),
    liked: Boolean(o.liked ?? o.is_liked ?? o.isLiked),
    likes_count,
    image_url,
    gallery_urls: gallery_urls.length > 0 ? gallery_urls : undefined,
    organizer_name,
    organizer:
      organizer_slug || organizer_name || organizer_id
        ? {
            id: organizer_id,
            slug: organizer_slug,
            name: organizer_name,
            logo_url: organizer_logo ?? null,
            verified: organizer_verified,
          }
        : undefined,
    start_time: start_time?.trim() ? start_time : null,
    end_time: end_time?.trim() ? end_time : null,
    category,
    tags,
    is_verified: is_verified_detail || undefined,
    is_promoted: is_promoted_detail || undefined,
    location,
    schedule,
    schedule_days,
    schedule_items,
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
  if (params?.q?.trim()) search.set('q', params.q.trim());
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
