import { apiFetch } from '@/lib/api/client';

type AnalyticsPayload = {
  event:
    | 'push_open'
    | 'festival_view'
    | 'festival_saved'
    | 'app_open'
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

export async function trackEvent(payload: AnalyticsPayload): Promise<void> {
  try {
    await apiFetch('/api/analytics/track', undefined, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // analytics should never block UX flows
  }
}

