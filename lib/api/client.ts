function joinBaseAndPath(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

export async function apiFetch(path: string, token?: string, init?: RequestInit): Promise<Response> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const url = joinBaseAndPath(baseUrl, path);
  const headers = new Headers(init?.headers ?? undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  console.log('[api] request:', path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    console.log('[api] response status:', res.status);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}
