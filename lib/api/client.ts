function joinBaseAndPath(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

export function apiFetch(path: string, token?: string): Promise<Response> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const url = joinBaseAndPath(baseUrl, path);
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { headers: Object.keys(headers).length ? headers : undefined });
}
