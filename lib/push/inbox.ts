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

export class InboxRequestError extends Error {
  code: 'unauthorized' | 'network' | 'invalid_payload';

  constructor(code: 'unauthorized' | 'network' | 'invalid_payload') {
    super(code);
    this.name = 'InboxRequestError';
    this.code = code;
  }
}

const EMPTY_PAGE: InboxPage = {
  items: [],
  pageInfo: { hasMore: false, nextCursor: null, limit: 20 },
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseItem(raw: unknown): InboxItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = asString(rec.id);
  const notificationId = asString(rec.notificationId);
  const type = asString(rec.type);
  const summary = asString(rec.summary);
  const status = asString(rec.status);
  const createdAt = asString(rec.createdAt);
  if (!id || !notificationId || !type || !summary || !status || !createdAt) return null;
  return {
    id,
    notificationId,
    type,
    summary,
    deepLink: asString(rec.deepLink),
    status,
    openedAt: asString(rec.openedAt),
    createdAt,
    unread: asBool(rec.unread, true),
  };
}

function parsePage(payload: unknown, fallbackLimit: number): InboxPage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ...EMPTY_PAGE, pageInfo: { ...EMPTY_PAGE.pageInfo, limit: fallbackLimit } };
  const rec = payload as Record<string, unknown>;
  const items = Array.isArray(rec.items) ? rec.items.map(parseItem).filter((item): item is InboxItem => item !== null) : [];
  const infoRaw = rec.pageInfo;
  const info =
    infoRaw && typeof infoRaw === 'object' && !Array.isArray(infoRaw) ? (infoRaw as Record<string, unknown>) : ({} as Record<string, unknown>);
  return {
    items,
    pageInfo: {
      hasMore: asBool(info.hasMore, false),
      nextCursor: asString(info.nextCursor),
      limit: typeof info.limit === 'number' && Number.isFinite(info.limit) && info.limit > 0 ? Math.floor(info.limit) : fallbackLimit,
    },
  };
}

export async function fetchInboxPage(cursor?: string | null, limit = 20, signal?: AbortSignal): Promise<InboxPage> {
  const sp = new URLSearchParams();
  sp.set('limit', String(limit));
  if (cursor) sp.set('cursor', cursor);
  let res: Response;
  try {
    res = await apiFetch(`/api/notifications/inbox?${sp.toString()}`, undefined, { signal });
  } catch {
    throw new InboxRequestError('network');
  }

  if (res.status === 401) {
    throw new InboxRequestError('unauthorized');
  }
  if (!res.ok) {
    throw new InboxRequestError('network');
  }

  try {
    const json = (await res.json()) as unknown;
    return parsePage(json, limit);
  } catch {
    throw new InboxRequestError('invalid_payload');
  }
}

export async function markInboxOpened(notificationId: string): Promise<void> {
  await apiFetch('/api/push/open', undefined, {
    method: 'POST',
    body: JSON.stringify({ notification_id: notificationId, open_context: 'foreground' }),
  }).catch(() => undefined);
}
