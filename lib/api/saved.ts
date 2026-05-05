import type { FestivalListItem } from './festivals';
import { apiFetch } from './client';

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
    saved: true,
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

function readErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return `Request failed (${status})`;
}

export async function toggleSaved(festivalId: string): Promise<{ saved: boolean }> {
  const res = await apiFetch('/api/plan/festivals', undefined, {
    method: 'POST',
    body: JSON.stringify({ festivalId }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(readErrorMessage(body, res.status));
  }
  const payload = asRecord(body)?.data ?? body;
  const saved = Boolean(
    asRecord(payload)?.saved ?? asRecord(payload)?.is_saved ?? asRecord(payload)?.isSaved
  );
  return { saved };
}

export async function getSavedFestivals(): Promise<FestivalListItem[]> {
  const res = await apiFetch('/api/plan/festivals');
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(readErrorMessage(body, res.status));
  }
  const payload = asRecord(body)?.data ?? body;
  if (!Array.isArray(payload)) return [];
  return payload.map(parseListItem).filter((item): item is FestivalListItem => item != null);
}
