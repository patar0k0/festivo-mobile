import { Linking, Platform } from 'react-native';

import { isValidCoordinatePair } from '@/lib/map/coordinates';

export function buildLocationQuery(parts: (string | undefined | null)[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

export function openInMaps(opts: {
  latitude?: number | null;
  longitude?: number | null;
  /** Used for label + fallback search when coords missing */
  queryFallback: string;
}): void {
  const { latitude, longitude, queryFallback } = opts;
  const q = queryFallback.trim() || 'България';
  const lat = latitude ?? null;
  const lng = longitude ?? null;

  if (lat != null && lng != null && isValidCoordinatePair(lat, lng)) {
    const label = encodeURIComponent(q.slice(0, 200));
    if (Platform.OS === 'ios') {
      void Linking.openURL(`http://maps.apple.com/?ll=${lat},${lng}&q=${label}`);
    } else {
      void Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`);
    }
    return;
  }

  void Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.slice(0, 400))}`,
  );
}
