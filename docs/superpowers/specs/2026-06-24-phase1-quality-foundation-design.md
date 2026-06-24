# Festivo Mobile — Фаза 1: Основи на качеството (Quality Foundation)

**Дата:** 2026-06-24
**Статус:** Чернова за преглед
**Обхват:** Първа от три фази по пътя „професионално/production-grade". Тази фаза изгражда фундамента, върху който стъпват Фаза 2 (robustness) и Фаза 3 (release).

---

## Цел

Да спрем регресиите и да направим кодовата база проверяема автоматично. След Фаза 1 всеки push трябва да минава през lint + typecheck + tests, критичната бизнес логика да е покрита с тестове, а runtime грешките да се виждат централизирано.

Това НЕ е release фаза. Не пипаме store assets, iOS билдове или i18n тук — те са Фаза 3.

## Контекст (текущо състояние)

- Expo 54 / React Native 0.81 / React 19 / expo-router / TanStack Query / Supabase auth + собствен REST API.
- TypeScript вече е `strict: true` (`tsconfig.json`).
- ESLint = базов `eslint-config-expo`, без допълнителни правила.
- **0 тестови файла, Jest не е инсталиран, няма CI workflow.**
- `lib/plan/offlineQueue.ts` и съседните модули са писани с чисти функции — лесни за unit тестване без мрежа.
- Sentry MCP е свързан към средата (org/project предстои да се потвърдят).

## Какво включва Фаза 1

### 1. Тестова инфраструктура
- `jest-expo` preset + `@testing-library/react-native` + `@testing-library/jest-native`.
- `jest.config.js` с `transformIgnorePatterns` за Expo/RN модулите.
- Mock-ове за `@react-native-async-storage/async-storage` и `expo-*` модулите, които пипат native слоя.
- npm скриптове: `test`, `test:watch`, `test:ci` (с coverage).
- Coverage праг: стартираме **без** твърд праг (за да не блокира), но collect-ваме coverage в CI за видимост. Праг се вдига във Фаза 2.

### 2. Първи тестове за критичната логика (pure-function first)
Приоритет — чисти функции без I/O, най-висок риск × най-лесни за тест:
- `lib/plan/offlineQueue.ts` — `compactPlannerQueueForPersistence` (dedupe по ключ, дроп на стари, подредба), `orderQueueForReplay` (festivals → schedule → reminders), `patchPlanStateFromQueue` (optimistic patch + orphan reminder cleanup), `parseQueueJson` (защита от повреден JSON), `isLikelyOfflinePlannerError`.
- `lib/plan/plannerPatch.ts`, `lib/plan/plannerMutationIntent.ts`, `lib/plan/scheduleItemId.ts` (synthetic id guard).
- `lib/search/searchRanking.ts`, `lib/search/normalizeSearch.ts`, `lib/search/groupSearchResults.ts`.
- `lib/festival/relativeDate.ts`, `lib/map/coordinates.ts`.

Целта на тази фаза е **покритие на бизнес логиката**, не на UI компонентите. 1–2 примерни компонентни теста (напр. `FestivalCard`) се добавят като шаблон, но широко UI покритие е извън обхвата.

### 3. CI pipeline
- GitHub Actions workflow (`.github/workflows/ci.yml`) на `push` и `pull_request`.
- Стъпки: `npm ci` → `npm run lint` → `tsc --noEmit` (typecheck) → `npm run test:ci`.
- Node версия закована към тази на разработка; кеширане на npm.
- Без билд/деплой стъпки в тази фаза.

### 4. Lint затягане (леко)
- Добавяме `tsc --noEmit` като отделен `typecheck` скрипт (Expo lint не прави пълен typecheck).
- Включваме малък набор правила, които ловят реални бъгове, без да наводняват: `no-unused-vars` (вече от Expo), `eqeqeq`. Без масов автоформат/Prettier миграция в тази фаза, за да не замъглим diff-овете.

### 5. Error tracking (Sentry)
- Интеграция на `@sentry/react-native` зад флаг — активен само в production билдове, тих в `__DEV__`.
- Свързване с вече наличния debug diagnostics слой (`lib/debug/*`) — една точка за репортване.
- DSN през env (`EXPO_PUBLIC_SENTRY_DSN`), без хардкод.
- Wrap на root layout с error boundary, който репортва към Sentry.

## Архитектура / подход

- **Тестовете живеят до кода**: `lib/plan/offlineQueue.test.ts` до `offlineQueue.ts` (co-located), което следва навигируемостта на проекта.
- **Без промяна на production поведение** в тази фаза, освен добавянето на Sentry и error boundary. Тестовете описват съществуващото поведение (characterization tests), не налагат ново.
- **Mock границата е мрежата и native модулите**. Чистите функции се тестват директно. API слоят (`lib/api/*`) се тества с mock-нат `fetch`/`apiFetch`, защото backend-ът „работи, но се променя".

## Извън обхвата (нарочно)
- i18n слой → Фаза 3.
- iOS нативна папка / билдове / store assets → Фаза 3.
- Широко UI/integration/e2e тестване (Detox/Maestro) → по-късно, след Фаза 2.
- Prettier/масов кодов стил рефактор.
- Coverage прагове като gate → Фаза 2.

## Критерии за приемане (Definition of Done)
1. `npm test` минава локално със зелено.
2. Критичните pure функции от секция 2 имат тестове, включително edge cases (повреден JSON, празна опашка, изтекли елементи, orphan reminders).
3. CI workflow минава зелено на PR и блокира при счупен lint/typecheck/test.
4. Sentry лови un-caught грешка в production билд (проверено с тестово хвърляне зад флаг).
5. README секция „Разработка" описва как се пускат тестове и lint (пълният README е Фаза 3, но тестовата част влиза тук).

## Рискове
- `jest-expo` + RN 0.81 + React 19 transform конфигурацията може да изисква донастройване на `transformIgnorePatterns`. Митигиране: започваме с официалния `jest-expo` preset.
- Sentry в Expo Go има ограничения; тестваме в development build, не в Expo Go.

## Следващи фази (само за ориентир, не са в този spec)
- **Фаза 2 — Robustness:** единен error/loading/empty pattern, error boundaries по екрани, coverage прагове, edge case одит на мутациите.
- **Фаза 3 — Release:** iOS таргет, EAS билд конфиг, store assets, privacy policy, i18n слой, пълна документация.
