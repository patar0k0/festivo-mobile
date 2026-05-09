import { apiFetch } from './client';

export type FollowedOrganizerItem = {
  organizerId: string;
  slug: string;
  name: string;
  logo_url: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getFollowedOrganizers(): Promise<FollowedOrganizerItem[]> {
  const res = await apiFetch('/api/mobile/followed-organizers');
  if (!res.ok) return [];
  const body = (await res.json()) as { organizers?: unknown[] };
  if (!Array.isArray(body.organizers)) return [];
  return body.organizers.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) return [];
    const organizerId = String(rec.organizerId ?? '');
    const slug = String(rec.slug ?? '');
    const name = String(rec.name ?? '');
    if (!organizerId || !slug) return [];
    return [
      {
        organizerId,
        slug,
        name,
        logo_url: typeof rec.logo_url === 'string' ? rec.logo_url : null,
      },
    ];
  });
}
