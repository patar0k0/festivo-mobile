import { QueryClient } from '@tanstack/react-query';

import { shouldRetryQuery } from '@/lib/query/retryPolicy';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations have their own offline-queue replay logic; do not auto-retry.
      retry: false,
    },
  },
});
