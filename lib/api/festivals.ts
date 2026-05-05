import { getAccessToken } from '@/lib/auth/useAuth';

import { apiFetch } from './client';

export type GetFestivalsParams = {
  page?: number | string;
  city?: string;
  category?: string;
  saved?: boolean;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export type FestivalListItem = {
  festivalId: string;
  slug: string;
  title: string;
  city: string;
  start_date: string;
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
  return {
    festivalId,
    slug,
    title,
    city: String(o.city ?? ''),
    start_date: String(o.start_date ?? o.startDate ?? ''),
    saved: Boolean(o.saved ?? o.is_saved ?? o.isSaved),
  };
}

function parseDetail(raw: unknown, fallbackSlug: string): FestivalDetail {
  const o = asRecord(raw) ?? {};
  const festivalId = String(o.festivalId ?? o.festival_id ?? o.id ?? '');
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
  return {
    festivalId,
    slug,
    title,
    description,
    city,
    start_date,
    end_date,
    saved: Boolean(o.saved ?? o.is_saved ?? o.isSaved),
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
  void params;
  const token = await getAccessToken();
  const path = '/api/mobile/festivals?limit=10';
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
  const data = rawList.map(parseListItem).filter((x): x is FestivalListItem => x != null);
  console.log('festivals:', data);
  return data;
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
