# Phase 2: Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Festivo Mobile a single tested pattern for loading/error/empty states, sane query defaults, and test coverage for the offline-queue async paths — without broad screen rewrites.

**Architecture:** Three small presentational/wrapper components (`EmptyState`, `ErrorState`, `QueryStateView`); a pure `shouldRetryQuery` predicate feeding centralized `queryClient` defaults; async tests for offline queue replay/hydrate with mocked API + AsyncStorage; one reference screen (`FollowingScreen`) migrated to the new components, which also fixes its missing error state.

**Tech Stack:** React Native 0.81, React 19, TanStack Query v5, Jest (jest-expo), @testing-library/react-native, Ionicons.

---

## File Structure

**Created:**
- `lib/query/retryPolicy.ts` — pure `shouldRetryQuery(failureCount, error)` predicate.
- `lib/query/retryPolicy.test.ts`
- `components/ui/EmptyState.tsx` — icon + title + optional subtitle + optional action.
- `components/ui/EmptyState.test.tsx`
- `components/ui/ErrorState.tsx` — message + "Опитай пак" retry button.
- `components/ui/ErrorState.test.tsx`
- `components/ui/QueryStateView.tsx` — chooses error/loading/empty/content from a query-like result.
- `components/ui/QueryStateView.test.tsx`
- `lib/plan/offlineQueue.async.test.ts` — replay/hydrate async coverage.

**Modified:**
- `lib/queryClient.ts` — add `defaultOptions` using `shouldRetryQuery`.
- `components/screens/FollowingScreen.tsx` — use the new components; add real error state.
- `jest.config.js` — add `coverageThreshold`.

---

## Task 1: `shouldRetryQuery` predicate

**Files:**
- Create: `lib/query/retryPolicy.ts`
- Test: `lib/query/retryPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/query/retryPolicy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/query/retryPolicy.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/query/retryPolicy.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/query/retryPolicy.ts lib/query/retryPolicy.test.ts
git commit -m "feat(query): add shouldRetryQuery retry predicate"
```

---

## Task 2: Centralize `queryClient` defaults

**Files:**
- Modify: `lib/queryClient.ts`

- [ ] **Step 1: Replace `lib/queryClient.ts` contents**

```ts
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
```

- [ ] **Step 2: Verify typecheck and existing tests still pass**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; all existing suites green (no test depends on the bare client).

- [ ] **Step 3: Commit**

```bash
git add lib/queryClient.ts
git commit -m "feat(query): centralize queryClient retry/stale defaults"
```

---

## Task 3: `EmptyState` component

**Files:**
- Create: `components/ui/EmptyState.tsx`
- Test: `components/ui/EmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and subtitle', () => {
    render(<EmptyState icon="sparkles-outline" title="Няма нищо" subtitle="Пробвай по-късно" />);
    expect(screen.getByText('Няма нищо')).toBeTruthy();
    expect(screen.getByText('Пробвай по-късно')).toBeTruthy();
  });

  it('renders an action button and fires onPress', () => {
    const onPress = jest.fn();
    render(
      <EmptyState icon="sparkles-outline" title="Празно" action={{ label: 'Действие', onPress }} />,
    );
    fireEvent.press(screen.getByText('Действие'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when no action is provided', () => {
    render(<EmptyState icon="sparkles-outline" title="Празно" />);
    expect(screen.queryByText('Действие')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/ui/EmptyState.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/ui/EmptyState.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={42} color="#9CA3AF" />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { marginTop: 10, fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: { marginTop: 6, textAlign: 'center', fontSize: 14, color: '#6B7280' },
  button: {
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- components/ui/EmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/EmptyState.tsx components/ui/EmptyState.test.tsx
git commit -m "feat(ui): add shared EmptyState component"
```

---

## Task 4: `ErrorState` component

**Files:**
- Create: `components/ui/ErrorState.tsx`
- Test: `components/ui/ErrorState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ErrorState } from '@/components/ui/ErrorState';

describe('ErrorState', () => {
  it('renders the message', () => {
    render(<ErrorState message="Нещо се обърка" onRetry={jest.fn()} />);
    expect(screen.getByText('Нещо се обърка')).toBeTruthy();
  });

  it('fires onRetry when the retry button is pressed', () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Грешка" onRetry={onRetry} />);
    fireEvent.press(screen.getByText('Опитай пак'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry button when no onRetry is provided', () => {
    render(<ErrorState message="Грешка" />);
    expect(screen.queryByText('Опитай пак')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/ui/ErrorState.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/ui/ErrorState.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ message = 'Нещо се обърка', onRetry }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name="cloud-offline-outline" size={42} color="#9CA3AF" />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Опитай пак</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 10, textAlign: 'center', fontSize: 15, color: '#374151' },
  button: {
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- components/ui/ErrorState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/ErrorState.tsx components/ui/ErrorState.test.tsx
git commit -m "feat(ui): add shared ErrorState component with retry"
```

---

## Task 5: `QueryStateView` wrapper

**Files:**
- Create: `components/ui/QueryStateView.tsx`
- Test: `components/ui/QueryStateView.test.tsx`

**Interface:** Takes a minimal query-like object so it is testable without TanStack Query. Priority: error (no data) → loading (no data) → empty (success, empty) → content.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { QueryStateView, type QueryLike } from '@/components/ui/QueryStateView';

function setup(query: QueryLike<number[]>) {
  return render(
    <QueryStateView<number[]>
      query={query}
      isEmpty={(d) => d.length === 0}
      loading={<Text>LOADING</Text>}
      empty={<Text>EMPTY</Text>}
    >
      {(data) => <Text>ITEMS:{data.length}</Text>}
    </QueryStateView>,
  );
}

describe('QueryStateView', () => {
  it('shows loading when loading and no data', () => {
    setup({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
    expect(screen.getByText('LOADING')).toBeTruthy();
  });

  it('shows error (with retry) when error and no data', () => {
    const refetch = jest.fn();
    setup({ data: undefined, isLoading: false, isError: true, refetch });
    fireEvent.press(screen.getByText('Опитай пак'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows empty when success but data is empty', () => {
    setup({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
    expect(screen.getByText('EMPTY')).toBeTruthy();
  });

  it('renders children with data when present', () => {
    setup({ data: [1, 2, 3], isLoading: false, isError: false, refetch: jest.fn() });
    expect(screen.getByText('ITEMS:3')).toBeTruthy();
  });

  it('prefers cached data over loading/error (no flicker on refetch)', () => {
    setup({ data: [1], isLoading: true, isError: true, refetch: jest.fn() });
    expect(screen.getByText('ITEMS:1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/ui/QueryStateView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/ui/QueryStateView.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- components/ui/QueryStateView.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/QueryStateView.tsx components/ui/QueryStateView.test.tsx
git commit -m "feat(ui): add QueryStateView state resolver"
```

---

## Task 6: Offline-queue async coverage

**Files:**
- Test: `lib/plan/offlineQueue.async.test.ts`
- Reference: `lib/plan/offlineQueue.ts`, `lib/api/mobilePlan.ts`

Note: `offlineQueue` imports named functions from `@/lib/api/mobilePlan` (`getMobilePlanState`, `saveFestivalToPlan`, `removeFestivalFromPlan`, `setScheduleItemInPlan`, `updateFestivalReminder`). Mock that module. AsyncStorage is already mocked globally in `jest.setup.js`; clear it between tests. Use a tiny fake `QueryClient` exposing `setQueryData` / `invalidateQueries`.

- [ ] **Step 1: Write the failing test**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import * as mobilePlan from '@/lib/api/mobilePlan';
import type { MobilePlanStateDto } from '@/lib/api/mobilePlan';
import {
  enqueueFestivalPlanMutation,
  replayQueuedPlannerMutations,
  hydrateQueuedPlannerMutations,
} from '@/lib/plan/offlineQueue';

jest.mock('@/lib/api/mobilePlan', () => ({
  getMobilePlanState: jest.fn(),
  saveFestivalToPlan: jest.fn(),
  removeFestivalFromPlan: jest.fn(),
  setScheduleItemInPlan: jest.fn(),
  updateFestivalReminder: jest.fn(),
}));

const mocked = mobilePlan as jest.Mocked<typeof mobilePlan>;

function emptyServerState(over: Partial<MobilePlanStateDto> = {}): MobilePlanStateDto {
  return {
    savedFestivalIds: [],
    savedFestivals: [],
    savedScheduleItemIds: [],
    reminders: {},
    stats: { savedFestivalCount: 0, plannedItemCount: 0, upcomingCount: 0 },
    updated_at: '2026-06-24T00:00:00.000Z',
    ...over,
  };
}

function fakeQueryClient() {
  const store: Record<string, unknown> = {};
  return {
    setQueryData: jest.fn((key: unknown, updater: unknown) => {
      const k = JSON.stringify(key);
      store[k] = typeof updater === 'function' ? (updater as (c: unknown) => unknown)(store[k]) : updater;
      return store[k];
    }),
    invalidateQueries: jest.fn(),
    getData: (key: unknown) => store[JSON.stringify(key)],
  } as unknown as QueryClient & { getData: (key: unknown) => unknown };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('replayQueuedPlannerMutations', () => {
  it('saves a queued festival the server does not yet have, then clears the queue', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState
      .mockResolvedValueOnce(emptyServerState()) // initial server snapshot
      .mockResolvedValueOnce(emptyServerState({ savedFestivalIds: ['F1'] })); // post-replay refresh
    mocked.saveFestivalToPlan.mockResolvedValue(emptyServerState({ savedFestivalIds: ['F1'] }) as never);

    const qc = fakeQueryClient();
    await replayQueuedPlannerMutations(qc);

    expect(mocked.saveFestivalToPlan).toHaveBeenCalledWith('F1');
    const raw = await AsyncStorage.getItem('festivo.plannerMutationQueue.v2');
    expect(JSON.parse(raw ?? '[]')).toHaveLength(0);
  });

  it('idempotently skips a mutation the server already satisfies', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState.mockResolvedValue(emptyServerState({ savedFestivalIds: ['F1'] }));

    await replayQueuedPlannerMutations(fakeQueryClient());

    expect(mocked.saveFestivalToPlan).not.toHaveBeenCalled();
  });

  it('keeps an item queued when its replay call fails', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    mocked.getMobilePlanState.mockResolvedValue(emptyServerState());
    mocked.saveFestivalToPlan.mockRejectedValue(new Error('Network request failed'));

    await replayQueuedPlannerMutations(fakeQueryClient());

    const raw = await AsyncStorage.getItem('festivo.plannerMutationQueue.v2');
    expect(JSON.parse(raw ?? '[]')).toHaveLength(1);
  });
});

describe('hydrateQueuedPlannerMutations', () => {
  it('applies queued intent onto cached plan state', async () => {
    await enqueueFestivalPlanMutation('F1', true);
    const qc = fakeQueryClient();
    qc.setQueryData(['mobilePlanState'], emptyServerState());

    await hydrateQueuedPlannerMutations(qc);

    const next = (qc as unknown as { getData: (k: unknown) => MobilePlanStateDto }).getData([
      'mobilePlanState',
    ]);
    expect(next.savedFestivalIds).toContain('F1');
  });
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `npm test -- lib/plan/offlineQueue.async.test.ts`
Expected: PASS. If `replayQueuedPlannerMutations` holds a module-level in-flight promise that leaks across tests, the `beforeEach` clears mocks but not that promise; each test enqueues distinct state so the awaited call resolves before the next starts — keep tests sequential (no `.concurrent`).

- [ ] **Step 3: Commit**

```bash
git add lib/plan/offlineQueue.async.test.ts
git commit -m "test(plan): cover offline queue replay and hydrate async paths"
```

---

## Task 7: Migrate `FollowingScreen` to shared state components

**Files:**
- Modify: `components/screens/FollowingScreen.tsx`

Context: currently the loading branch (`feedQuery.isLoading && items.length === 0`) renders 3 skeletons, and the empty branch (`items.length === 0 && !feedQuery.isFetching`) renders an inline empty block. There is **no error branch** — an errored feed shows the empty copy. Replace both early-returns with `QueryStateView`, preserving the existing skeleton and empty copy, and adding a real error state.

- [ ] **Step 1: Add imports**

At the top of `components/screens/FollowingScreen.tsx`, alongside the existing imports, add:
```tsx
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryStateView } from '@/components/ui/QueryStateView';
import type { QueryLike } from '@/components/ui/QueryStateView';
```

- [ ] **Step 2: Replace the two early-return blocks**

Delete this block:
```tsx
  if (feedQuery.isLoading && items.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <Skeleton height={96} radius={14} />
        <Skeleton height={96} radius={14} />
        <Skeleton height={96} radius={14} />
      </View>
    );
  }

  if (items.length === 0 && !feedQuery.isFetching) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="sparkles-outline" size={42} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Все още няма активности</Text>
        <Text style={styles.emptySub}>Последвайте организатори, за да получите персонализиран feed.</Text>
      </View>
    );
  }

  return (
    <FlatList
```

Replace it with a `QueryStateView` wrapping the existing `<FlatList ...>`. Build a `QueryLike` from the infinite query and feed the already-computed `items` as its data:
```tsx
  const feedState: QueryLike<FollowFeedItem[]> = {
    data: feedQuery.isLoading && items.length === 0 ? undefined : items,
    isLoading: feedQuery.isLoading,
    isError: feedQuery.isError,
    refetch: () => {
      void feedQuery.refetch();
    },
  };

  return (
    <QueryStateView<FollowFeedItem[]>
      query={feedState}
      isEmpty={(data) => data.length === 0}
      loading={
        <View style={styles.loadingWrap}>
          <Skeleton height={96} radius={14} />
          <Skeleton height={96} radius={14} />
          <Skeleton height={96} radius={14} />
        </View>
      }
      empty={
        <EmptyState
          icon="sparkles-outline"
          title="Все още няма активности"
          subtitle="Последвайте организатори, за да получите персонализиран feed."
        />
      }
    >
      {() => (
        <FlatList
```

Then, at the end of the original `return (<FlatList ... />);`, close the `QueryStateView`:
```tsx
        />
      )}
    </QueryStateView>
  );
```

(The `FlatList` body and props are unchanged — it still reads `items` from the outer scope.)

- [ ] **Step 3: Remove now-unused styles/imports if any linter flags them**

Run: `npm run lint`
Expected: 0 errors. `styles.emptyWrap`, `styles.emptyTitle`, `styles.emptySub` may now be unused — the lint config does not flag unused style keys, so leave them unless lint reports them. If `Ionicons` becomes unused (it is still used by `FollowCard`), keep it.

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; all suites green.

- [ ] **Step 5: Commit**

```bash
git add components/screens/FollowingScreen.tsx
git commit -m "refactor(following): use shared QueryStateView/EmptyState + add error state"
```

---

## Task 8: Coverage threshold

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Measure current coverage**

Run: `npm run test:ci`
Expected: a coverage table prints. Note the `All files` row percentages for `% Stmts`, `% Branch`, `% Funcs`, `% Lines`.

- [ ] **Step 2: Add a threshold just below current numbers**

Edit `jest.config.js` to add a `coverageThreshold` key inside the exported config object. Use values a few points below the measured `All files` row so the gate passes today but catches regressions. Example values (replace each with `floor(measured - 3)` from Step 1):
```js
  coverageThreshold: {
    global: {
      statements: 35,
      branches: 25,
      functions: 35,
      lines: 35,
    },
  },
```

- [ ] **Step 3: Verify the gate passes**

Run: `npm run test:ci`
Expected: exits 0; no "coverage threshold not met" error. If it fails, lower the failing metric to `floor(measured - 3)` and re-run.

- [ ] **Step 4: Commit**

```bash
git add jest.config.js
git commit -m "test(ci): enforce a coverage floor"
```

---

## Definition of Done (verify before declaring complete)

- [ ] `npm test` passes (all suites, including new ones).
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run test:ci` passes with the coverage threshold enforced.
- [ ] `QueryStateView`, `EmptyState`, `ErrorState` exist with tests and `FollowingScreen` uses them.
- [ ] `FollowingScreen` now shows an error state with retry (previously absent).
- [ ] `queryClient` has retry/stale defaults driven by the tested `shouldRetryQuery`.
- [ ] Offline-queue replay/hydrate async paths are covered (idempotent skip, partial-failure retention).
