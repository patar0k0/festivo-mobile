# Festivo Mobile — Фаза 2: Robustness

**Дата:** 2026-06-24
**Статус:** Чернова за преглед
**Обхват:** Втора от три фази към production-grade. Стъпва върху Фаза 1 (тестове + CI + Sentry). Подход: **консервативен (Option A)** — изграждаме споделена инфраструктура за състояния, конфигурираме query слоя, покриваме отложените async пътища с тестове, и мигрираме **само един еталонен екран**.

---

## Цел

Потребителят да не вижда счупено състояние: всяко зареждане, грешка и празнина да минава през единен, тестван pattern; query слоят да се държи разумно при мрежови проблеми (без безсмислени retry-та на 4xx); критичните async пътища на offline queue да са покрити с тестове.

Това НЕ е release фаза. Без i18n, iOS билд, store assets (→ Фаза 3). Без масова миграция на всички екрани (само HomeScreen като еталон).

## Контекст (текущо състояние)

- `lib/queryClient.ts` е голо `new QueryClient()` — никакви defaults за retry/staleTime/refetch.
- Екраните преоткриват loading/error/empty inline. HomeScreen има 6+ места с триадата `isLoading && len===0 ? skeleton : isError ? error : content`.
- Има `components/ui/Skeleton.tsx`, но **няма** споделени `EmptyState` / `ErrorState`.
- API грешките се хвърлят като обикновени `Error` със статус в текста (`Request failed (404)`, `readErrorMessage(body, status)`); мрежовите грешки са `Network request failed` без статус. Няма структуриран error тип.
- Async пътищата `hydrateQueuedPlannerMutations` / `replayQueuedPlannerMutations` в `lib/plan/offlineQueue.ts` останаха непокрити във Фаза 1.

## Какво включва Фаза 2

### 1. Споделени state компоненти (нови, малки, тествани)
- `components/ui/EmptyState.tsx` — Ionicons икона + заглавие + опционално подзаглавие + опционално действие (бутон с callback). Чисто презентационен.
- `components/ui/ErrorState.tsx` — съобщение + бутон „Опитай пак" (`onRetry` callback). Чисто презентационен.
- `components/ui/QueryStateView.tsx` — обвива TanStack Query резултат и рендерира по приоритет:
  1. `isError && няма данни` → `ErrorState` с `onRetry={refetch}`
  2. `isLoading && няма данни` → подаденият `loading` (skeleton)
  3. `успех && празни данни` → подаденият `empty` (EmptyState)
  4. иначе → `children(data)`
  Запазва съществуващото поведение „покажи кеширани данни докато презарежда" (не показва skeleton/error върху наличен кеш).

### 2. Централизирана `queryClient` конфигурация
- `lib/query/retryPolicy.ts` (нов) — чиста функция `shouldRetryQuery(failureCount, error)`:
  - извлича 3-цифрен HTTP статус от `error.message` (regex `\b(\d{3})\b`);
  - 4xx **без** 408/429 → `false` (не retry-ва клиентски грешки);
  - всичко друго (мрежа без статус, 5xx, 408, 429) → retry до 2 пъти (`failureCount < 2`).
- `lib/queryClient.ts` пренаписан с `defaultOptions.queries`: `retry: shouldRetryQuery`, `staleTime: 60_000`, `gcTime: 5 * 60_000`, `refetchOnReconnect: true`, `refetchOnWindowFocus: false`. Мутациите: `retry: false` (мутациите имат собствена offline queue логика).

### 3. Тестове
- `lib/query/retryPolicy.test.ts` — 4xx без retry; 5xx/мрежа/408/429 с retry; спиране на `failureCount >= 2`; липсващ статус → третиран като retryable.
- `lib/plan/offlineQueue.async.test.ts` — с mock-нат `@/lib/api/mobilePlan` и AsyncStorage:
  - `replayQueuedPlannerMutations`: idempotent skip когато сървърът вече е в desired state; partial failure → елементът остава в опашката; успешен replay изпразва опашката и опреснява кеша; зачита реда festival → schedule → reminder.
  - `hydrateQueuedPlannerMutations`: прилага опашката върху кеширан plan state; emit-ва partial събитие когато няма кеширан state.
- Компонентни тестове (първи RNTL render): `EmptyState` рендерира заглавие/действие; `ErrorState` извиква `onRetry` при натискане; `QueryStateView` избира правилния клон за всяко състояние.

### 4. Миграция на еталонен екран
- `components/screens/HomeScreen.tsx` минава секциите си към `QueryStateView` + `EmptyState`/`ErrorState`. Поведението остава визуално еквивалентно; целта е да докаже pattern-а и да намали inline дублирането. Останалите екрани се мигрират по-късно (извън тази фаза).

### 5. Coverage праг
- `jest.config.js` получава скромен глобален `coverageThreshold`, който минава днес: `{ global: { lines: 35, functions: 35, statements: 35, branches: 25 } }`. Точните числа се потвърждават спрямо реалния отчет при имплементация и се сетват малко под текущото покритие, за да не чупят CI, но да хванат регресия надолу.
- CI вече пуска `test:ci` (с coverage), така че прагът се прилага автоматично.

## Архитектура / подход

- Новите компоненти са презентационни и без зависимост от query слоя, освен `QueryStateView`, който приема минимален интерфейс (`{ isLoading, isError, data, refetch }`) — лесен за тест с обикновени обекти, без да мокваме TanStack Query.
- `retryPolicy` е чиста функция, изолирана от `queryClient`, за да е unit-тестваема без React.
- Без структуриран `ApiError` тип в тази фаза — нарочно, за да не пипаме ~10 api файла (консервативност). Статусът се чете от текста на грешката, което покрива съществуващия формат.

## Извън обхвата (нарочно)
- Миграция на екрани извън HomeScreen.
- Структуриран `ApiError` рефактор на api слоя.
- i18n, iOS, store assets, EAS (→ Фаза 3).
- e2e/Detox/Maestro.
- Качване на coverage прага до високи стойности (постепенно).

## Критерии за приемане (Definition of Done)
1. `npm test` минава зелено; новите suite-ове включени.
2. `QueryStateView`, `EmptyState`, `ErrorState` съществуват, тествани са, и HomeScreen ги ползва.
3. `queryClient` има defaults; `shouldRetryQuery` е изваден и тестван (4xx не retry-ва, 5xx/мрежа retry-ва).
4. Async offline queue пътищата имат тестове, включително partial-failure и idempotent skip.
5. `jest.config.js` има coverageThreshold; `npm run test:ci` минава с него.
6. `npm run lint` и `npm run typecheck` остават зелени.

## Рискове
- HomeScreen миграцията може да промени визуалното поведение на ръба (кеш vs skeleton). Митигиране: `QueryStateView` пази „кеш докато презарежда"; ревю на diff-а спрямо текущите 6 места.
- `staleTime`/`refetchOnReconnect` промяна може да измени честотата на заявките. Митигиране: консервативни стойности (60s stale), без агресивен refetch.

## Следваща фаза (само за ориентир)
- **Фаза 3 — Release:** iOS таргет, EAS билд конфиг, store assets, privacy policy, i18n слой, пълна документация.
