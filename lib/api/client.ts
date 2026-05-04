function joinBaseAndPath(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

export function apiFetch(path: string, token?: string, init?: RequestInit): Promise<Response> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const url = joinBaseAndPath(baseUrl, path);
  const headers = new Headers(init?.headers ?? undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, {
    ...init,
    headers,
  });
}
