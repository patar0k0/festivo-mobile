declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_API_URL?: string;
    /** Optional; defaults to origin of EXPO_PUBLIC_API_URL for /privacy etc. */
    EXPO_PUBLIC_SITE_URL?: string;
    /** Sentry DSN — error tracking is enabled in production builds only when set. */
    EXPO_PUBLIC_SENTRY_DSN?: string;
  }
}
