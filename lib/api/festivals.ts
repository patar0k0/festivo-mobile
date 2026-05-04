import { getAccessToken } from '@/lib/auth/useAuth';

import { apiFetch } from './client';

export type GetFestivalsParams = {
  page?: number | string;
  city?: string;
  category?: string;
};

export type FestivalListItem = {
  slug: string;
  title: string;
  city: string;
  start_date: string;
};

export type FestivalDetail = {
  slug: string;
  title: string;
  description: string;
  city: string;
  start_date: string;
  end_date?: string;
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
  const slug = String(o.slug ?? '');
  const title = String(o.title ?? '');
  if (!slug || !title) return null;
  return {
    slug,
    title,
    city: String(o.city ?? ''),
    start_date: String(o.start_date ?? o.startDate ?? ''),
  };
}

function parseDetail(raw: unknown, fallbackSlug: string): FestivalDetail {
  const o = asRecord(raw) ?? {};
  const slug = String(o.slug ?? fallbackSlug);
  const title = String(o.title ?? '');
  const description = String(o.description ?? '');
  const city = String(o.city ?? '');
  const start_date = String(o.start_date ?? o.startDate ?? '');
  const end_date =
    o.end_date != null
      ? String(o.end_date)
      : o.endDate != null
        ? String(o.endDate)
        : undefined;
  return { slug, title, description, city, start_date, end_date };
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
  const token = await getAccessToken();
  const search = new URLSearchParams();
  if (params?.page != null) search.set('page', String(params.page));
  if (params?.city) search.set('city', params.city);
  if (params?.category) search.set('category', params.category);
  const qs = search.toString();
  const path = `/api/mobile/festivals${qs ? `?${qs}` : ''}`;
  const res = await apiFetch(path, token ?? undefined);
  if (!res.ok) {
    const body = await readJson(res);
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  const body = await readJson(res);
  const rawList = Array.isArray(body) ? body : asRecord(body)?.data;
  if (!Array.isArray(rawList)) return [];
  return rawList.map(parseListItem).filter((x): x is FestivalListItem => x != null);
}

export async function getFestival(slug: string): Promise<FestivalDetail> {
  const token = await getAccessToken();
  const path = `/api/mobile/festivals/${encodeURIComponent(slug)}`;
  const res = await apiFetch(path, token ?? undefined);
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
