import { apiFetch } from '@/lib/api/client';

export type InboxItem = {
  id: string;
  notificationId: string;
  type: string;
  summary: string;
  deepLink: string | null;
  status: string;
  openedAt: string | null;
  createdAt: string;
  unread: boolean;
};

export type InboxPage = {
  items: InboxItem[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
};

export async function fetchInboxPage(cursor?: string | null, limit = 20): Promise<InboxPage> {
  const sp = new URLSearchParams();
  sp.set('limit', String(limit));
  if (cursor) sp.set('cursor', cursor);
  const res = await apiFetch(`/api/notifications/inbox?${sp.toString()}`);
  if (!res.ok) throw new Error('inbox_load_failed');
  return (await res.json()) as InboxPage;
}

export async function markInboxOpened(notificationId: string): Promise<void> {
  await apiFetch('/api/push/open', undefined, {
    method: 'POST',
    body: JSON.stringify({ notification_id: notificationId, open_context: 'foreground' }),
  }).catch(() => undefined);
}
