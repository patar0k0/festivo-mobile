import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/useAuth';

type PushPlatform = 'ios' | 'android';

function resolveEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function registerPush(): Promise<void> {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return;
    }

    if (!Device.isDevice) {
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.error('[registerPush] notification permission not granted');
      return;
    }

    const projectId = resolveEasProjectId();
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResult.data;

    const bearer = await getAccessToken();
    if (!bearer) {
      console.error('[registerPush] missing access token');
      return;
    }

    const platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    const res = await apiFetch('/api/push/register', bearer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[registerPush] backend rejected registration', res.status, text);
    }
  } catch (e) {
    console.error('[registerPush]', e);
  }
}
