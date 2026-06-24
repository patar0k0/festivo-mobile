import { shouldRetryQuery, extractHttpStatus } from '@/lib/query/retryPolicy';

describe('extractHttpStatus', () => {
  it('pulls a 3-digit status out of an error message', () => {
    expect(extractHttpStatus(new Error('Request failed (404)'))).toBe(404);
  });
  it('returns undefined when no status present', () => {
    expect(extractHttpStatus(new Error('Network request failed'))).toBeUndefined();
  });
  it('returns undefined for nullish', () => {
    expect(extractHttpStatus(null)).toBeUndefined();
  });
});

describe('shouldRetryQuery', () => {
  it('does not retry client errors (4xx)', () => {
    expect(shouldRetryQuery(0, new Error('Request failed (404)'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('Forbidden (403)'))).toBe(false);
  });
  it('retries 408 and 429 despite being 4xx', () => {
    expect(shouldRetryQuery(0, new Error('Timeout (408)'))).toBe(true);
    expect(shouldRetryQuery(0, new Error('Too many (429)'))).toBe(true);
  });
  it('retries 5xx and network errors', () => {
    expect(shouldRetryQuery(0, new Error('Request failed (500)'))).toBe(true);
    expect(shouldRetryQuery(0, new Error('Network request failed'))).toBe(true);
  });
  it('stops retrying after 2 attempts', () => {
    expect(shouldRetryQuery(1, new Error('Network request failed'))).toBe(true);
    expect(shouldRetryQuery(2, new Error('Network request failed'))).toBe(false);
  });
});
