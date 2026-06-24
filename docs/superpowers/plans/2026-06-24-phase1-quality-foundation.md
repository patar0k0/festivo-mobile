# Phase 1: Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a test harness, business-logic test coverage, CI, full typecheck, and production error tracking to Festivo Mobile without changing user-facing behavior.

**Architecture:** Tests are co-located next to the code they cover (`foo.ts` → `foo.test.ts`). Pure functions are tested directly; network and native modules are mocked. CI runs lint + typecheck + tests on every push/PR. Sentry is wired in behind a production-only flag through the existing diagnostics layer.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript (strict), `jest-expo`, `@testing-library/react-native`, GitHub Actions, `@sentry/react-native`.

---

## File Structure

**Created:**
- `jest.config.js` — Jest config using the `jest-expo` preset.
- `jest.setup.js` — global mocks (AsyncStorage, reanimated, etc.).
- `lib/plan/scheduleItemId.test.ts`
- `lib/search/normalizeSearch.test.ts`
- `lib/map/coordinates.test.ts`
- `lib/festival/relativeDate.test.ts`
- `lib/plan/plannerPatch.test.ts`
- `lib/plan/offlineQueue.test.ts`
- `lib/search/searchRanking.test.ts`
- `.github/workflows/ci.yml` — CI pipeline.
- `lib/observability/sentry.ts` — Sentry init + capture wrapper.
- `components/ErrorBoundary.tsx` — root error boundary reporting to Sentry.

**Modified:**
- `package.json` — devDeps + `test`, `test:watch`, `test:ci`, `typecheck` scripts.
- `eslint.config.js` — add `eqeqeq` rule.
- `app/_layout.tsx` — init Sentry, wrap tree in `ErrorBoundary`.
- `app.json` — add Sentry env wiring note (DSN via env, no plugin build step yet).
- `README.md` — add a "Разработка / Development" section (tests + lint commands).
- `env.d.ts` — declare `EXPO_PUBLIC_SENTRY_DSN`.

---

## Task 1: Test harness setup

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `jest.setup.js`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install --save-dev jest-expo jest @testing-library/react-native @testing-library/jest-native @types/jest
```
Expected: packages added to `devDependencies`, no peer-dep errors that abort install.

- [ ] **Step 2: Create `jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@sentry/.*|react-native-reanimated|react-native-worklets))',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    '!lib/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

- [ ] **Step 3: Create `jest.setup.js`**

```js
import '@testing-library/jest-native/extend-expect';

// AsyncStorage native module mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Reanimated mock (safe no-op for logic tests)
jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {};
  }
});
```

- [ ] **Step 4: Add scripts to `package.json`**

In the `"scripts"` block, add:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:ci": "jest --ci --coverage --maxWorkers=2",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Smoke-test the harness**

Create a temporary file `lib/__smoke__.test.ts`:
```ts
test('jest harness runs', () => {
  expect(1 + 1).toBe(2);
});
```
Run: `npm test -- lib/__smoke__.test.ts`
Expected: 1 passing test. Then delete the smoke file: `rm lib/__smoke__.test.ts`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js jest.setup.js
git commit -m "chore(test): add jest-expo test harness and scripts"
```

---

## Task 2: Test `scheduleItemId` (proves harness on real code)

**Files:**
- Test: `lib/plan/scheduleItemId.test.ts`
- Reference: `lib/plan/scheduleItemId.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  isSyntheticPlannerScheduleItemId,
  assertPlannerMutableScheduleItemId,
} from '@/lib/plan/scheduleItemId';

describe('isSyntheticPlannerScheduleItemId', () => {
  it('flags pd- prefixed ids as synthetic', () => {
    expect(isSyntheticPlannerScheduleItemId('pd-123')).toBe(true);
  });

  it('treats server uuids as non-synthetic', () => {
    expect(isSyntheticPlannerScheduleItemId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
});

describe('assertPlannerMutableScheduleItemId', () => {
  it('throws for synthetic ids', () => {
    expect(() => assertPlannerMutableScheduleItemId('pd-9')).toThrow();
  });

  it('does not throw for server ids', () => {
    expect(() => assertPlannerMutableScheduleItemId('abc-123')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/plan/scheduleItemId.test.ts`
Expected: PASS (4 tests). Implementation already exists; this characterizes it.

- [ ] **Step 3: Commit**

```bash
git add lib/plan/scheduleItemId.test.ts
git commit -m "test(plan): cover synthetic schedule-item id guard"
```

---

## Task 3: Test `normalizeSearch`

**Files:**
- Test: `lib/search/normalizeSearch.test.ts`
- Reference: `lib/search/normalizeSearch.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(normalizeSearchText('café')).toBe('cafe');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSearchText('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/search/normalizeSearch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/search/normalizeSearch.test.ts
git commit -m "test(search): cover query normalization"
```

---

## Task 4: Test `coordinates`

**Files:**
- Test: `lib/map/coordinates.test.ts`
- Reference: `lib/map/coordinates.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  isValidCoordinatePair,
  looksLikeBulgaria,
  getDefaultMapRegion,
  getSofiaRegion,
  BULGARIA_REGION,
} from '@/lib/map/coordinates';

describe('isValidCoordinatePair', () => {
  it('accepts in-range coordinates', () => {
    expect(isValidCoordinatePair(42.7, 23.3)).toBe(true);
  });

  it('rejects out-of-range latitude/longitude', () => {
    expect(isValidCoordinatePair(91, 0)).toBe(false);
    expect(isValidCoordinatePair(0, 181)).toBe(false);
  });

  it('rejects NaN / Infinity', () => {
    expect(isValidCoordinatePair(NaN, 0)).toBe(false);
    expect(isValidCoordinatePair(0, Infinity)).toBe(false);
  });
});

describe('looksLikeBulgaria', () => {
  it('accepts Sofia', () => {
    expect(looksLikeBulgaria(42.6977, 23.3219)).toBe(true);
  });

  it('rejects London', () => {
    expect(looksLikeBulgaria(51.5, -0.12)).toBe(false);
  });
});

describe('region helpers', () => {
  it('returns a fresh default region copy each call', () => {
    const a = getDefaultMapRegion();
    a.latitude = 0;
    expect(getDefaultMapRegion().latitude).toBe(BULGARIA_REGION.latitude);
  });

  it('honors the delta argument for Sofia', () => {
    expect(getSofiaRegion(0.5).latitudeDelta).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/map/coordinates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/map/coordinates.test.ts
git commit -m "test(map): cover coordinate validation and region helpers"
```

---

## Task 5: Test `relativeDate`

**Files:**
- Test: `lib/festival/relativeDate.test.ts`
- Reference: `lib/festival/relativeDate.ts`

Note: `getRelativeDateLabel`/`getStartsInLabelBg` read `new Date()` internally with no clock override, so tests use Jest fake timers to pin "today".

- [ ] **Step 1: Write the failing test**

```ts
import {
  isFestivalPast,
  getStartsInLabelBg,
} from '@/lib/festival/relativeDate';

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
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/festival/relativeDate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/festival/relativeDate.test.ts
git commit -m "test(festival): cover relative date labels and past detection"
```

---

## Task 6: Test `plannerPatch`

**Files:**
- Test: `lib/plan/plannerPatch.test.ts`
- Reference: `lib/plan/plannerPatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  normalizePlannerIdList,
  patchMobilePlanSnapshotForItem,
} from '@/lib/plan/plannerPatch';
import type { MobilePlanStateDto } from '@/lib/api/mobilePlan';

function makePlan(scheduleIds: string[]): MobilePlanStateDto {
  return {
    savedFestivalIds: [],
    savedFestivals: [],
    savedScheduleItemIds: scheduleIds,
    reminders: {},
    stats: { savedFestivalCount: 0, plannedItemCount: scheduleIds.length, upcomingCount: 0 },
    updated_at: '2026-06-24T00:00:00.000Z',
  };
}

describe('normalizePlannerIdList', () => {
  it('dedupes, trims, drops empties and sorts', () => {
    expect(normalizePlannerIdList([' b ', 'a', 'a', ''])).toEqual(['a', 'b']);
  });
});

describe('patchMobilePlanSnapshotForItem', () => {
  it('adds an item and bumps plannedItemCount', () => {
    const next = patchMobilePlanSnapshotForItem(makePlan(['a']), 'b', true)!;
    expect(next.savedScheduleItemIds).toEqual(['a', 'b']);
    expect(next.stats.plannedItemCount).toBe(2);
  });

  it('removes an item and lowers plannedItemCount', () => {
    const next = patchMobilePlanSnapshotForItem(makePlan(['a', 'b']), 'b', false)!;
    expect(next.savedScheduleItemIds).toEqual(['a']);
    expect(next.stats.plannedItemCount).toBe(1);
  });

  it('is a no-op when desired state already matches (returns same ref)', () => {
    const plan = makePlan(['a']);
    expect(patchMobilePlanSnapshotForItem(plan, 'a', true)).toBe(plan);
  });

  it('returns plan unchanged for empty id', () => {
    const plan = makePlan(['a']);
    expect(patchMobilePlanSnapshotForItem(plan, '   ', true)).toBe(plan);
  });

  it('returns undefined plan as-is', () => {
    expect(patchMobilePlanSnapshotForItem(undefined, 'a', true)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/plan/plannerPatch.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/plan/plannerPatch.test.ts
git commit -m "test(plan): cover optimistic planner snapshot patching"
```

---

## Task 7: Test `offlineQueue` pure functions

**Files:**
- Test: `lib/plan/offlineQueue.test.ts`
- Reference: `lib/plan/offlineQueue.ts`

Note: only the exported pure functions are tested here (`compactPlannerQueueForPersistence`, `orderQueueForReplay`, `isLikelyOfflinePlannerError`). The async replay/hydrate paths hit the network and `AsyncStorage` — they are covered in Phase 2's integration pass, not here.

- [ ] **Step 1: Write the failing test**

```ts
import {
  compactPlannerQueueForPersistence,
  orderQueueForReplay,
  isLikelyOfflinePlannerError,
  type QueuedPlannerMutation,
} from '@/lib/plan/offlineQueue';

function festival(id: string, desiredSaved: boolean, createdAt: string): QueuedPlannerMutation {
  return { id: `f:${id}:${createdAt}`, kind: 'festival', festivalId: id, desiredSaved, createdAt };
}
function schedule(id: string, desiredInPlan: boolean, createdAt: string): QueuedPlannerMutation {
  return { id: `s:${id}:${createdAt}`, kind: 'scheduleItem', scheduleItemId: id, desiredInPlan, createdAt };
}
function reminder(id: string, createdAt: string): QueuedPlannerMutation {
  return { id: `r:${id}:${createdAt}`, kind: 'reminder', festivalId: id, reminderType: '24h', createdAt };
}

const T0 = '2026-06-24T10:00:00.000Z';
const T1 = '2026-06-24T10:00:01.000Z';

describe('compactPlannerQueueForPersistence', () => {
  it('keeps only the last intent per festival key', () => {
    const out = compactPlannerQueueForPersistence([
      festival('A', true, T0),
      festival('A', false, T1),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ festivalId: 'A', desiredSaved: false });
  });

  it('drops items older than the max age window', () => {
    const ancient = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const out = compactPlannerQueueForPersistence([festival('A', true, ancient)]);
    expect(out).toHaveLength(0);
  });

  it('drops items with unparseable createdAt', () => {
    const out = compactPlannerQueueForPersistence([festival('A', true, 'nope')]);
    expect(out).toHaveLength(0);
  });

  it('orders survivors by createdAt ascending', () => {
    const out = compactPlannerQueueForPersistence([
      festival('B', true, T1),
      festival('A', true, T0),
    ]);
    expect(out.map((i) => (i.kind === 'festival' ? i.festivalId : ''))).toEqual(['A', 'B']);
  });
});

describe('orderQueueForReplay', () => {
  it('orders festivals before schedule items before reminders', () => {
    const out = orderQueueForReplay([
      reminder('A', T0),
      schedule('s1', true, T1),
      festival('A', true, T0),
    ]);
    expect(out.map((i) => i.kind)).toEqual(['festival', 'scheduleItem', 'reminder']);
  });
});

describe('isLikelyOfflinePlannerError', () => {
  it('detects network failure messages', () => {
    expect(isLikelyOfflinePlannerError(new Error('Network request failed'))).toBe(true);
    expect(isLikelyOfflinePlannerError(new Error('Failed to fetch'))).toBe(true);
  });

  it('returns false for unrelated errors and nullish', () => {
    expect(isLikelyOfflinePlannerError(new Error('500 server error'))).toBe(false);
    expect(isLikelyOfflinePlannerError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/plan/offlineQueue.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/plan/offlineQueue.test.ts
git commit -m "test(plan): cover offline queue compaction and replay ordering"
```

---

## Task 8: Test `searchRanking`

**Files:**
- Test: `lib/search/searchRanking.test.ts`
- Reference: `lib/search/searchRanking.ts`

Note: `rankSearchResults` accepts an `options.now` clock override — use it for determinism instead of fake timers. Build minimal `FestivalListItem` fixtures; cast through a helper since only ranking-relevant fields matter.

- [ ] **Step 1: Write the failing test**

```ts
import { rankSearchResults, containsWholeWord } from '@/lib/search/searchRanking';
import type { FestivalListItem } from '@/lib/api/festivals';

const NOW = new Date(2026, 5, 24); // 2026-06-24 local

function fest(partial: Partial<FestivalListItem>): FestivalListItem {
  return {
    title: '',
    slug: partial.slug ?? (partial.title ?? 'x'),
    start_date: '2026-07-01',
    end_date: null,
    city: null,
    image_url: null,
    saves_count: 0,
    ...partial,
  } as FestivalListItem;
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
```

- [ ] **Step 2: Run test**

Run: `npm test -- lib/search/searchRanking.test.ts`
Expected: PASS (6 tests). If a `FestivalListItem` required field is missing, add it to the `fest` helper defaults — do not change `searchRanking.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/search/searchRanking.test.ts
git commit -m "test(search): cover relevance ranking and tie-breaks"
```

---

## Task 9: Typecheck script + lint tightening

**Files:**
- Modify: `eslint.config.js`
- Reference: `package.json` (`typecheck` script added in Task 1)

- [ ] **Step 1: Add `eqeqeq` rule to ESLint**

Edit `eslint.config.js` to add a `rules` block:
```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
]);
```

- [ ] **Step 2: Run typecheck and lint, fix only real violations**

Run: `npm run typecheck`
Expected: exits 0. If errors appear, fix them (they are real bugs the loose CLI lint missed).

Run: `npm run lint`
Expected: exits 0. `{ null: 'ignore' }` permits the existing `== null` nullish checks (e.g. `searchRanking.ts:164`), so they should not flag. Fix any genuine `==`/`!=` violations elsewhere.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): enforce eqeqeq and document typecheck script"
```

---

## Task 10: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:ci
```

- [ ] **Step 2: Verify the same commands pass locally (CI parity)**

Run: `npm ci && npm run lint && npm run typecheck && npm run test:ci`
Expected: all four exit 0; coverage summary prints.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck and test on push and PR"
```

---

## Task 11: Sentry error tracking + error boundary

**Files:**
- Create: `lib/observability/sentry.ts`
- Create: `components/ErrorBoundary.tsx`
- Modify: `app/_layout.tsx`
- Modify: `env.d.ts`

- [ ] **Step 1: Install Sentry**

Run:
```bash
npx expo install @sentry/react-native
```
Expected: package added; Expo picks a compatible version for SDK 54.

- [ ] **Step 2: Declare the DSN env var in `env.d.ts`**

Add to the existing `ProcessEnv` declaration:
```ts
EXPO_PUBLIC_SENTRY_DSN?: string;
```

- [ ] **Step 3: Create `lib/observability/sentry.ts`**

```ts
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
```

- [ ] **Step 4: Create `components/ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captureError } from '@/lib/observability/sentry';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    captureError(error, { componentStack: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>Нещо се обърка</Text>
          <Text style={styles.body}>Рестартирай приложението. Грешката е докладвана.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 14, color: '#64748B', textAlign: 'center' },
});
```

- [ ] **Step 5: Wire into `app/_layout.tsx`**

At the top of the file, after the existing imports, add:
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initSentry } from '@/lib/observability/sentry';
```
Immediately after `SplashScreen.preventAutoHideAsync();`, add:
```tsx
initSentry();
```
In `RootLayout`'s returned JSX, wrap the `<SafeAreaProvider>` subtree so it is the outermost child:
```tsx
return (
  <ErrorBoundary>
    <SafeAreaProvider>
      {/* ...existing tree unchanged... */}
    </SafeAreaProvider>
  </ErrorBoundary>
);
```

- [ ] **Step 6: Verify typecheck and tests still pass**

Run: `npm run typecheck && npm test`
Expected: exits 0; existing tests still green (no behavior change in dev — `initSentry` returns early under `__DEV__`).

- [ ] **Step 7: Commit**

```bash
git add lib/observability/sentry.ts components/ErrorBoundary.tsx app/_layout.tsx env.d.ts
git commit -m "feat(observability): add Sentry error tracking behind prod flag + root error boundary"
```

---

## Task 12: Document the dev workflow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a development section to `README.md`**

Add at the end of the file:
```markdown
## Разработка / Development

Изисквания: Node 20, npm.

```bash
npm ci            # инсталиране на зависимости
npm start         # Expo dev server
npm run android   # билд/пускане на Android
```

### Качество на кода

```bash
npm run lint        # ESLint (eslint-config-expo + eqeqeq)
npm run typecheck   # tsc --noEmit (strict)
npm test            # Jest (jest-expo)
npm run test:watch  # тестове в watch режим
npm run test:ci     # тестове с coverage (както в CI)
```

Тестовете живеят до кода, който покриват (`foo.ts` → `foo.test.ts`). CI (GitHub Actions) пуска lint + typecheck + tests на всеки push и PR.

### Error tracking

Production билдовете репортват грешки към Sentry, ако `EXPO_PUBLIC_SENTRY_DSN` е зададен в средата. В development Sentry е изключен.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document dev workflow, quality commands and error tracking"
```

---

## Definition of Done (verify before declaring complete)

- [ ] `npm test` passes locally (all suites green).
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run test:ci` produces a coverage summary.
- [ ] CI workflow file present and the same four commands pass locally (CI parity).
- [ ] Sentry init is guarded by `__DEV__` and DSN presence; error boundary renders fallback UI.
- [ ] README has the "Разработка / Development" section.
```
