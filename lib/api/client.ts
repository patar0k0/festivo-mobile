import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getAccessToken } from '@/lib/auth/useAuth';

/** Abort an in-flight request after this long so the UI never hangs on a dead socket. */
const DEFAULT_TIMEOUT_MS = 15_000;

const APP_VERSION =
  Constants.expoConfig?.version ?? (Constants.nativeAppVersion as string | undefined) ?? 'unknown';
const CLIENT_ID = `festivo-${Platform.OS}`;

export async function apiFetch(path: string, token?: string, init?: RequestInit) {
  const accessToken = token ?? (await getAccessToken());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-festivo-app-version': APP_VERSION,
    'x-festivo-client': CLIENT_ID,
    ...(init?.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (__DEV__) {
    console.log('[API] no bearer token for', path);
  }

  // Bridge the caller's AbortSignal (if any) with our own timeout controller so
  // either source can cancel the request.
  const controller = new AbortController();
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (__DEV__) {
      console.log('[API]', init?.method ?? 'GET', path, res.status);
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
