import {
  isValidCoordinatePair,
  looksLikeBulgaria,
  getDefaultMapRegion,
  getSofiaRegion,
  BULGARIA_REGION,
} from '@/lib/map/coordinates';

describe('isValidCoordinatePair', () => {
  it('accepts in-range coordinates', () => {
    expect(isValidCoordinatePair(42.7, 23.3)).toBe(true);
  });

  it('rejects out-of-range latitude/longitude', () => {
    expect(isValidCoordinatePair(91, 0)).toBe(false);
    expect(isValidCoordinatePair(0, 181)).toBe(false);
  });

  it('rejects NaN / Infinity', () => {
    expect(isValidCoordinatePair(NaN, 0)).toBe(false);
    expect(isValidCoordinatePair(0, Infinity)).toBe(false);
  });
});

describe('looksLikeBulgaria', () => {
  it('accepts Sofia', () => {
    expect(looksLikeBulgaria(42.6977, 23.3219)).toBe(true);
  });

  it('rejects London', () => {
    expect(looksLikeBulgaria(51.5, -0.12)).toBe(false);
  });
});

describe('region helpers', () => {
  it('returns a fresh default region copy each call', () => {
    const a = getDefaultMapRegion();
    a.latitude = 0;
    expect(getDefaultMapRegion().latitude).toBe(BULGARIA_REGION.latitude);
  });

  it('honors the delta argument for Sofia', () => {
    expect(getSofiaRegion(0.5).latitudeDelta).toBe(0.5);
  });
});
