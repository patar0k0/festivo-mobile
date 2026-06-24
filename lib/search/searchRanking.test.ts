import { rankSearchResults, containsWholeWord } from '@/lib/search/searchRanking';
import type { FestivalListItem } from '@/lib/api/festivals';

const NOW = new Date(2026, 5, 24); // 2026-06-24 local

let seq = 0;
function fest(partial: Partial<FestivalListItem>): FestivalListItem {
  seq += 1;
  return {
    festivalId: partial.festivalId ?? `id-${seq}`,
    slug: partial.slug ?? partial.title ?? `slug-${seq}`,
    title: partial.title ?? '',
    city: partial.city ?? '',
    start_date: partial.start_date ?? '2026-07-01',
    saved: false,
    saves_count: 0,
    ...partial,
  };
}

describe('containsWholeWord', () => {
  it('matches a whole normalized word', () => {
    expect(containsWholeWord('Джаз Фест', 'джаз')).toBe(true);
  });
  it('does not match a partial-only token', () => {
    expect(containsWholeWord('Джазария', 'джаз')).toBe(false);
  });
});

describe('rankSearchResults', () => {
  it('returns a copy when query is empty', () => {
    const input = [fest({ title: 'A' })];
    const out = rankSearchResults(input, '   ', { now: NOW });
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('ranks an exact title match above an unrelated item', () => {
    const items = [
      fest({ title: 'Балкан Фест', start_date: '2026-07-10' }),
      fest({ title: 'Джаз', start_date: '2026-07-10' }),
    ];
    const out = rankSearchResults(items, 'Джаз', { now: NOW });
    expect(out[0].title).toBe('Джаз');
  });

  it('pushes past events to the bottom', () => {
    const items = [
      fest({ title: 'Джаз', start_date: '2026-05-01', end_date: '2026-05-02' }), // past
      fest({ title: 'Джаз', start_date: '2026-08-01', end_date: '2026-08-02' }), // future
    ];
    const out = rankSearchResults(items, 'Джаз', { now: NOW });
    expect(out[0].start_date).toBe('2026-08-01');
  });

  it('breaks score ties by saves_count', () => {
    const items = [
      fest({ title: 'Джаз', start_date: '2026-08-01', saves_count: 2 }),
      fest({ title: 'Джаз', start_date: '2026-08-01', saves_count: 50 }),
    ];
    const out = rankSearchResults(items, 'Джаз', { now: NOW });
    expect(out[0].saves_count).toBe(50);
  });
});
