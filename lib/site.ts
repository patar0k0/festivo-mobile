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

/** Public organizer profile on festivo-web (`/organizers/[slug]`). */
export function getOrganizerPublicUrl(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const origin = getWebSiteOrigin();
  return origin ? `${origin}/organizers/${encodeURIComponent(trimmed)}` : null;
}

/** Subscribe / download ICS for a festival (`/festival/[slug]/ics`). */
export function getFestivalIcsUrl(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const origin = getWebSiteOrigin();
  return origin ? `${origin}/festival/${encodeURIComponent(trimmed)}/ics` : null;
}

export function getFestivalPublicUrl(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const origin = getWebSiteOrigin();
  return origin ? `${origin}/festivals/${encodeURIComponent(trimmed)}` : null;
}
