import { getAccessToken } from '@/lib/auth/useAuth';

export async function apiFetch(path: string, token?: string, init?: RequestInit) {
  const accessToken = token ?? (await getAccessToken());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    console.log('[API] NO TOKEN');
  }

  console.log('[API] request:', path);
  console.log('[API] token present:', !!accessToken);

  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers,
  });

  console.log('[API] status:', res.status);

  return res;
}
