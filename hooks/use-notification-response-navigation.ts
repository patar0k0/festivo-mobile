import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { apiFetch } from '@/lib/api/client';
import { trackEvent } from '@/lib/analytics/track';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { isExpoGo } from '@/lib/push/isExpoGo';

type NotificationRouteTarget =
  | { type: 'festival'; slug: string }
  | { type: 'organizer'; slug: string }
  | { type: 'map' };

function parseRouteTargetFromData(data: unknown): NotificationRouteTarget | null {
  if (data == null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (typeof record.deep_link === 'string') {
    const deepLink = record.deep_link.trim();
    const festivalMatch = deepLink.match(/festival\/([^/?#]+)/);
    if (festivalMatch?.[1]) {
      try {
        return { type: 'festival', slug: decodeURIComponent(festivalMatch[1]) };
      } catch {
        return { type: 'festival', slug: festivalMatch[1] };
      }
    }
    const organizerMatch = deepLink.match(/organizer\/([^/?#]+)/);
    if (organizerMatch?.[1]) {
      try {
        return { type: 'organizer', slug: decodeURIComponent(organizerMatch[1]) };
      } catch {
        return { type: 'organizer', slug: organizerMatch[1] };
      }
    }
    if (deepLink.includes('://map')) {
      return { type: 'map' };
    }
  }

  if (typeof record.destination === 'string') {
    const destination = record.destination.trim();
    if (destination === 'map') return { type: 'map' };
  }

  if (typeof record.organizer_slug === 'string') {
    const slug = record.organizer_slug.trim();
    if (slug.length > 0) return { type: 'organizer', slug };
  }

  if (typeof record.slug === 'string') {
    const trimmed = record.slug.trim();
    if (trimmed.length > 0) return { type: 'festival', slug: trimmed };
  }

  if (typeof record.url === 'string') {
    const url = record.url.trim();
    if (!url) return null;
    const match = url.match(/festival\/([^/?#]+)/);
    if (match?.[1]) {
      try {
        return { type: 'festival', slug: decodeURIComponent(match[1]) };
      } catch {
        return { type: 'festival', slug: match[1] };
      }
    }
    const organizerMatch = url.match(/organizer\/([^/?#]+)/);
    if (organizerMatch?.[1]) {
      try {
        return { type: 'organizer', slug: decodeURIComponent(organizerMatch[1]) };
      } catch {
        return { type: 'organizer', slug: organizerMatch[1] };
      }
    }
  }

  return null;
}

function navigateFromResponse(
  router: ReturnType<typeof useRouter>,
  response: {
    notification: { request: { content: { data: unknown } } };
  } | null,
) {
  if (!response) return;
  const data = response.notification.request.content.data;
  const target = parseRouteTargetFromData(data);
  if (!target) {
    router.push('/notification-fallback');
    return;
  }
  const record = data as Record<string, unknown>;
  const notificationId = typeof record.notification_id === 'string' ? record.notification_id : undefined;
  const festivalId = typeof record.festival_id === 'string' ? record.festival_id : undefined;
  const openContext = (record.__open_context as string | undefined) ?? 'background';
  if (__DEV__) {
    console.log('[festivo] notification open', { target });
  }
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (target.type === 'festival') {
      void apiFetch(`/api/mobile/festivals/${encodeURIComponent(target.slug)}`).then((res) => {
        if (res.ok) {
          router.push(festivalDetailHref(target.slug));
        } else {
          router.push('/notification-fallback');
        }
      });
      void trackEvent({
        event: 'push_open',
        notification_id: notificationId,
        festival_id: festivalId,
        slug: target.slug,
        source: 'push',
      });
      if (notificationId) {
        void apiFetch('/api/push/open', undefined, {
          method: 'POST',
          body: JSON.stringify({
            notification_id: notificationId,
            open_context: openContext,
          }),
        });
      }
      return;
    }
    if (target.type === 'organizer') {
      router.push(`/organizer/${target.slug}`);
      void trackEvent({
        event: 'push_open',
        notification_id: notificationId,
        festival_id: festivalId,
        slug: target.slug,
        source: 'push',
      });
      if (notificationId) {
        void apiFetch('/api/push/open', undefined, {
          method: 'POST',
          body: JSON.stringify({
            notification_id: notificationId,
            open_context: openContext,
          }),
        });
      }
      return;
    }
    router.push('/map');
    void trackEvent({
      event: 'push_open',
      notification_id: notificationId,
      festival_id: festivalId,
      source: 'push',
      metadata: { destination: 'map' },
    });
    if (notificationId) {
      void apiFetch('/api/push/open', undefined, {
        method: 'POST',
        body: JSON.stringify({
          notification_id: notificationId,
          open_context: openContext,
        }),
      });
    }
  } catch {
    router.push('/notification-fallback');
  }
}

/**
 * Opens the festival screen when the user taps a push notification
 * (foreground/background) or when the app was cold-started from one.
 */
export function useNotificationResponseNavigation() {
  const router = useRouter();

  useEffect(() => {
    const seenNotificationIds = new Set<string>();
    if (Platform.OS === 'web' || isExpoGo) return;

    let active = true;
    let removeListener: (() => void) | undefined;

    void (async () => {
      const Notifications = await import('expo-notifications');
      if (!active) return;

      const response = await Notifications.getLastNotificationResponseAsync();
      if (!active) return;
      if (response) {
        const data = response.notification.request.content.data as Record<string, unknown>;
        data.__open_context = 'cold_start';
        const notificationId = typeof data.notification_id === 'string' ? data.notification_id : null;
        if (!notificationId || !seenNotificationIds.has(notificationId)) {
          if (notificationId) seenNotificationIds.add(notificationId);
          navigateFromResponse(router, response);
        }
      }

      const subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
        const data = nextResponse.notification.request.content.data as Record<string, unknown>;
        const notificationId = typeof data.notification_id === 'string' ? data.notification_id : null;
        data.__open_context = AppState.currentState === 'active' ? 'foreground' : 'background';
        if (notificationId && seenNotificationIds.has(notificationId)) {
          return;
        }
        if (notificationId) seenNotificationIds.add(notificationId);
        navigateFromResponse(router, nextResponse);
      });
      removeListener = () => subscription.remove();
    })();

    return () => {
      active = false;
      removeListener?.();
    };
  }, [router]);
}
