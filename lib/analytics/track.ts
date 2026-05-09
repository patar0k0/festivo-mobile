import { apiFetch } from '@/lib/api/client';

/** Must match festivo-web `lib/analytics/types` / DB `analytics_events_event_check`. */
const SERVER_ANALYTICS_EVENTS = ['push_open', 'festival_view', 'festival_saved', 'app_open'] as const;

type AnalyticsEventServer = (typeof SERVER_ANALYTICS_EVENTS)[number];

function isServerAnalyticsEvent(value: string): value is AnalyticsEventServer {
  return (SERVER_ANALYTICS_EVENTS as readonly string[]).includes(value);
}

type AnalyticsPayload = {
  event:
    | AnalyticsEventServer
    | 'follow_feed_open'
    | 'follow_feed_card_click'
    | 'map_interaction'
    | 'map_search_area'
    | 'proof_pill_click'
    | 'recommendation_explanation_click';
  notification_id?: string;
  festival_id?: string;
  slug?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type ServerPayload = {
  event: AnalyticsEventServer;
  notification_id?: string;
  festival_id?: string;
  slug?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

function normalizeForServer(payload: AnalyticsPayload): ServerPayload {
  if (isServerAnalyticsEvent(payload.event)) {
    return {
      event: payload.event,
      ...(payload.notification_id !== undefined ? { notification_id: payload.notification_id } : {}),
      ...(payload.festival_id !== undefined ? { festival_id: payload.festival_id } : {}),
      ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
      ...(payload.source !== undefined ? { source: payload.source } : {}),
      ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
    };
  }

  const baseMeta =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? { ...payload.metadata }
      : {};

  return {
    event: 'app_open',
    ...(payload.notification_id !== undefined ? { notification_id: payload.notification_id } : {}),
    ...(payload.festival_id !== undefined ? { festival_id: payload.festival_id } : {}),
    ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
    ...(payload.source !== undefined ? { source: payload.source } : {}),
    metadata: { ...baseMeta, client_event: payload.event },
  };
}

/** 400 responses: log once per client `event` in dev; suppress duplicate sends for same normalized body. */
const devWarned400ClientEvent = new Set<string>();
const suppressed400Fingerprint = new Set<string>();

function fingerprintPayload(body: ServerPayload): string {
  try {
    return JSON.stringify(body);
  } catch {
    return `${body.event}:unserializable`;
  }
}

export async function trackEvent(payload: AnalyticsPayload): Promise<void> {
  const body = normalizeForServer(payload);
  const fp = fingerprintPayload(body);
  if (suppressed400Fingerprint.has(fp)) {
    return;
  }

  try {
    const res = await apiFetch('/api/analytics/track', undefined, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.status === 400) {
      suppressed400Fingerprint.add(fp);
      if (__DEV__ && !devWarned400ClientEvent.has(payload.event)) {
        devWarned400ClientEvent.add(payload.event);
        let detail = '';
        try {
          detail = await res.text();
        } catch {
          /* ignore */
        }
        console.warn('[analytics] track 400 (suppressing repeats for this payload)', {
          client_event: payload.event,
          sent_event: body.event,
          detail: detail.slice(0, 500),
        });
      }
    }
  } catch {
    // analytics should never block UX flows
  }
}

export type { AnalyticsPayload };
