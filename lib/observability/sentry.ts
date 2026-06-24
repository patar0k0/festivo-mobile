import * as Sentry from '@sentry/react-native';

let initialized = false;

/** Init Sentry once, only outside dev and only when a DSN is configured. */
export function initSentry(): void {
  if (initialized || __DEV__) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
  initialized = true;
}

/** Report an error to Sentry in production; log to console in dev. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) {
    console.error('[captureError]', error, context);
    return;
  }
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
