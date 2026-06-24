import { normalizeSearchText } from '@/lib/search/normalizeSearch';

describe('normalizeSearchText', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeSearchText('  Джаз   Фест ')).toBe('джаз фест');
  });

  it('replaces dash variants with a space', () => {
    expect(normalizeSearchText('Джаз-Фест')).toBe('джаз фест');
    expect(normalizeSearchText('Джаз—Фест')).toBe('джаз фест');
  });

  it('removes typographic quotes', () => {
    expect(normalizeSearchText('„Фест“')).toBe('фест');
  });

  it('strips combining marks', () => {
    // é (e + combining acute) → e
    expect(normalizeSearchText('café')).toBe('cafe');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSearchText('   ')).toBe('');
  });
});
