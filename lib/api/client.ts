import { getAccessToken } from '@/lib/auth/useAuth';

export async function apiFetch(path: string, token?: string, init?: RequestInit) {
  const accessToken = token ?? (await getAccessToken());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (__DEV__) {
    console.log('[API] no bearer token for', path);
  }

  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers,
  });

  if (__DEV__) {
    console.log('[API]', init?.method ?? 'GET', path, res.status);
  }

  return res;
}
