import { apiFetch } from './client';
import { parseListItem, type FestivalListItem } from './festivals';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
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
  const rec = asRecord(body);
  if (rec) {
    const msg = rec.message ?? rec.error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return `Request failed (${status})`;
}

export type ToggleLikedResult = {
  liked: boolean;
  likes_count: number;
};

function parseToggleLikedResponse(body: unknown): ToggleLikedResult {
  const rec = asRecord(body);
  if (!rec) throw new Error('Like response was empty');

  const likedRaw = rec.liked ?? rec.is_liked ?? rec.isLiked;
  let liked: boolean;
  if (typeof likedRaw === 'boolean') liked = likedRaw;
  else if (likedRaw === 1 || likedRaw === '1' || likedRaw === 'true') liked = true;
  else if (likedRaw === 0 || likedRaw === '0' || likedRaw === 'false') liked = false;
  else throw new Error('Like response missing liked flag');

  const countRaw = rec.likes_count ?? rec.likesCount;
  const likes_count =
    typeof countRaw === 'number' && Number.isFinite(countRaw)
      ? Math.max(0, Math.floor(countRaw))
      : typeof countRaw === 'string' && countRaw.trim()
        ? Math.max(0, Math.floor(Number(countRaw)) || 0)
        : 0;

  return { liked, likes_count };
}

export async function likeFestival(festivalId: string): Promise<ToggleLikedResult> {
  const res = await apiFetch('/api/mobile/festivals/like', undefined, {
    method: 'POST',
    body: JSON.stringify({ festivalId }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(readErrorMessage(body, res.status));
  return parseToggleLikedResponse(body);
}

export async function unlikeFestival(festivalId: string): Promise<ToggleLikedResult> {
  const res = await apiFetch('/api/mobile/festivals/like', undefined, {
    method: 'DELETE',
    body: JSON.stringify({ festivalId }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(readErrorMessage(body, res.status));
  return parseToggleLikedResponse(body);
}

export async function getLikedFestivals(): Promise<FestivalListItem[]> {
  const res = await apiFetch('/api/mobile/me/likes');
  const body = await readJson(res);
  if (!res.ok) throw new Error(readErrorMessage(body, res.status));
  const rec = asRecord(body);
  const list = Array.isArray(body)
    ? body
    : Array.isArray(rec?.festivals)
      ? rec.festivals
      : Array.isArray(rec?.data)
        ? rec.data
        : [];
  return list
    .map((item) => parseListItem(item))
    .filter((item): item is FestivalListItem => item != null);
}
