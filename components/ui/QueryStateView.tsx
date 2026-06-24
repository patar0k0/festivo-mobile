import type { ReactElement, ReactNode } from 'react';

import { ErrorState } from '@/components/ui/ErrorState';

export type QueryLike<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

type Props<T> = {
  query: QueryLike<T>;
  /** True when data is present but should render the empty state (e.g. empty list). */
  isEmpty: (data: T) => boolean;
  loading: ReactNode;
  empty: ReactNode;
  errorMessage?: string;
  children: (data: T) => ReactNode;
};

/**
 * Resolves a query result to one of: cached content, error, loading, empty.
 * Cached data always wins so a background refetch never flickers the screen.
 */
export function QueryStateView<T>({
  query,
  isEmpty,
  loading,
  empty,
  errorMessage,
  children,
}: Props<T>): ReactElement {
  const { data, isLoading, isError, refetch } = query;

  if (data !== undefined && !isEmpty(data)) {
    return <>{children(data)}</>;
  }
  if (isError) {
    return <ErrorState message={errorMessage} onRetry={refetch} />;
  }
  if (isLoading) {
    return <>{loading}</>;
  }
  if (data !== undefined && isEmpty(data)) {
    return <>{empty}</>;
  }
  return <>{loading}</>;
}
