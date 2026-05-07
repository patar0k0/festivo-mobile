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

/** Plan POST must expose a boolean saved flag; `Boolean(undefined)` was falsely turning success into `saved: false`. */
function parseToggleSavedResponse(body: unknown): boolean {
  const rec = asRecord(body);
  if (!rec) {
    throw new Error('Save response was empty');
  }
  const nested = asRecord(rec.data);
  const raw =
    rec.saved ??
    rec.is_saved ??
    rec.isSaved ??
    nested?.saved ??
    nested?.is_saved ??
    nested?.isSaved;

  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === 0 || raw === '0' || raw === 'false') return false;
  throw new Error(`Save response missing or invalid saved flag: ${JSON.stringify(body).slice(0, 240)}`);
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
  const saved = parseToggleSavedResponse(body);
  return { saved };
}

export async function getSavedFestivals(): Promise<FestivalListItem[]> {
  try {
    const res = await apiFetch('/api/plan/festivals');
    const body = await readJson(res);

    if (!res.ok) {
      console.error('[SAVED API ERROR]', res.status);
      throw new Error(readErrorMessage(body, res.status));
    }

    const record = asRecord(body);
    const list = Array.isArray(body)
      ? body
      : Array.isArray(record?.festivals)
        ? record.festivals
        : Array.isArray(record?.data)
          ? record.data
          : [];
    if (!Array.isArray(list)) return [];

    const normalizedList = list.map((item) => {
      const recordItem = asRecord(item);
      if (!recordItem) return item;
      return {
        ...recordItem,
        festivalId: recordItem.id ?? recordItem.festivalId ?? recordItem.festival_id,
      };
    });

    return normalizedList
      .map(parseListItem)
      .filter((item): item is FestivalListItem => item != null)
      .map((item) => ({ ...item, festivalId: item.festivalId }));
  } catch (e) {
    console.error('[SAVED FETCH FAILED]', e);
    throw e;
  }
}
