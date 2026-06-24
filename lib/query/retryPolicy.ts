const MAX_RETRIES = 2;
const RETRYABLE_4XX = new Set([408, 429]);

/** Pull a 3-digit HTTP status out of an Error message, if present. */
export function extractHttpStatus(error: unknown): number | undefined {
  if (!error) return undefined;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b(\d{3})\b/);
  if (!match) return undefined;
  const status = Number(match[1]);
  return status >= 100 && status <= 599 ? status : undefined;
}

/**
 * Retry transient failures (network, 5xx, 408, 429) up to MAX_RETRIES.
 * Never retry deterministic client errors (other 4xx).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  const status = extractHttpStatus(error);
  if (status != null && status >= 400 && status < 500 && !RETRYABLE_4XX.has(status)) {
    return false;
  }
  return true;
}
