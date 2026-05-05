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
  response: {
    notification: { request: { content: { data: unknown } } };
  } | null,
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

    let active = true;
    let removeListener: (() => void) | undefined;

    void (async () => {
      const Notifications = await import('expo-notifications');
      if (!active) return;

      const response = await Notifications.getLastNotificationResponseAsync();
      if (!active) return;
      navigateFromResponse(router, response);

      const subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
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
