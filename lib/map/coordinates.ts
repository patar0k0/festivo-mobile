/** Default map viewport — Bulgaria. */
export const BULGARIA_REGION = {
  latitude: 42.75,
  longitude: 25.5,
  latitudeDelta: 4.8,
  longitudeDelta: 5.4,
};

const SOFIA_CENTER = { latitude: 42.6977, longitude: 23.3219 };

export function getDefaultMapRegion() {
  return { ...BULGARIA_REGION };
}

export function getSofiaRegion(delta = 0.35) {
  return {
    latitude: SOFIA_CENTER.latitude,
    longitude: SOFIA_CENTER.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export function isValidCoordinatePair(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/** Rough bounding box for Bulgaria — excludes obviously wrong geocodes. */
export function looksLikeBulgaria(lat: number, lng: number): boolean {
  return lat >= 41.2 && lat <= 44.3 && lng >= 22.3 && lng <= 28.7;
}
