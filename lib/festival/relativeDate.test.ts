import { isFestivalPast, getStartsInLabelBg } from '@/lib/festival/relativeDate';

describe('isFestivalPast', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 24, 12, 0, 0)); // 2026-06-24 local
  });
  afterAll(() => jest.useRealTimers());

  it('returns false when no dates provided', () => {
    expect(isFestivalPast(null, null)).toBe(false);
  });

  it('returns true for a festival that ended yesterday', () => {
    expect(isFestivalPast('2026-06-20', '2026-06-23')).toBe(true);
  });

  it('returns false for a festival ending today', () => {
    expect(isFestivalPast('2026-06-24', '2026-06-24')).toBe(false);
  });

  it('falls back to start_date when end_date is empty', () => {
    expect(isFestivalPast('2026-06-23', '')).toBe(true);
  });

  it('treats unparseable dates as not-past', () => {
    expect(isFestivalPast('not-a-date')).toBe(false);
  });
});

describe('getStartsInLabelBg', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 24, 12, 0, 0));
  });
  afterAll(() => jest.useRealTimers());

  it('says "Вече започна" for past start', () => {
    expect(getStartsInLabelBg('2026-06-23')).toBe('Вече започна');
  });

  it('says "Започва утре" for tomorrow', () => {
    expect(getStartsInLabelBg('2026-06-25')).toBe('Започва утре');
  });

  it('says "След N дни" for further out', () => {
    expect(getStartsInLabelBg('2026-06-28')).toBe('След 4 дни');
  });
});
