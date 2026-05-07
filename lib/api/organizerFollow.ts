import { apiFetch } from './client';

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
  if (typeof body === 'object' && body && 'error' in body) {
    return String((body as { error: unknown }).error);
  }
  if (typeof body === 'object' && body && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return `Request failed (${status})`;
}

export async function followOrganizer(organizerId: string): Promise<void> {
  const res = await apiFetch('/api/follow/organizer', undefined, {
    method: 'POST',
    body: JSON.stringify({ organizer_id: organizerId }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(readErrorMessage(body, res.status));
  }
}

export async function unfollowOrganizer(organizerId: string): Promise<void> {
  const res = await apiFetch('/api/follow/organizer', undefined, {
    method: 'DELETE',
    body: JSON.stringify({ organizer_id: organizerId }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(readErrorMessage(body, res.status));
  }
}
