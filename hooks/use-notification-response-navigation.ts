import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

function parseFestivalSlugFromData(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (typeof record.slug === 'string') {
    const trimmed = record.slug.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (typeof record.url === 'string') {
    const url = record.url.trim();
    if (!url) return null;
    const match = url.match(/festival\/([^/?#]+)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }

  return null;
}

function navigateFromResponse(
  router: ReturnType<typeof useRouter>,
  response: Notifications.NotificationResponse | null,
) {
  if (!response) return;
  const data = response.notification.request.content.data;
  const slug = parseFestivalSlugFromData(data);
  if (!slug) return;
  try {
    router.push(`/festival/${slug}`);
  } catch {
    // ignore invalid routes or router edge cases
  }
}

/**
 * Opens the festival screen when the user taps a push notification
 * (foreground/background) or when the app was cold-started from one.
 */
export function useNotificationResponseNavigation() {
  const router = useRouter();

  useEffect(() => {
    if (__DEV__) return;
    if (Platform.OS === 'web') return;

    let subscription: Notifications.Subscription | undefined;

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      navigateFromResponse(router, response);
    });

    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromResponse(router, response);
    });

    return () => subscription?.remove();
  }, [router]);
}
