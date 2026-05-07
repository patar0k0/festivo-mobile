/** Public site origin for in-app links (privacy, etc.). Falls back to API URL origin. */
export function getWebSiteOrigin(): string | null {
  const site = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, '');
  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!api) return null;
  try {
    return new URL(api).origin;
  } catch {
    return null;
  }
}

export function getPrivacyPolicyUrl(): string | null {
  const origin = getWebSiteOrigin();
  return origin ? `${origin}/privacy` : null;
}
