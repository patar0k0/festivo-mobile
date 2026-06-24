# Festivo Mobile — Фаза 3: Android Release Readiness

**Дата:** 2026-06-25
**Статус:** Чернова за преглед
**Обхват:** Трета фаза към production. Подготвя проекта за публикуване в Google Play (Android-first). Конфигурация + runbook, без пипане на работещи екрани. i18n и iOS се отлагат (бъдещи фази — няма Apple Developer акаунт; виж [[no-apple-developer-account]]).

---

## Цел

Проектът да е готов за Android билд и публикуване в Google Play: валиден `eas.json`, правилен package id, OTA ъпдейти за бързи корекции след release, и ясен runbook за стъпките, които изискват акаунти (които агентът не може да изпълни).

Това НЕ включва: iOS билд, i18n, маркетинг графики (агентът не може да ги генерира), реално пускане на cloud билд (изисква Expo/Google акаунти на потребителя).

## Контекст (текущо състояние)

- `app.json`: `name: Festivo`, `version: 1.0.0`, Android adaptive icon вече настроен, Sentry + expo-router + expo-location + splash plugins налични. Package id е placeholder `com.anonymous.festivomobile`. Location permissions масивът има **дублирани** записи (ACCESS_COARSE/FINE_LOCATION по два пъти).
- **Няма** `eas.json`, `eas-cli`, `expo-updates`.
- Домейн: `festivo.bg` (от `EXPO_PUBLIC_API_URL`). Privacy policy се очаква на `https://festivo.bg/privacy` (`lib/site.ts` → `getPrivacyPolicyUrl`).
- `newArchEnabled: true`, `reactCompiler: true`, `typedRoutes: true`.

## Решения (потвърдени)

- **Package id:** `bg.festivo.mobile` (reverse-DNS на домейна). Необратимо след първо публикуване — затова се фиксира сега.
- **EAS Update (OTA):** включва се сега, за да са възможни бързи JS/UI корекции без нов Store билд.

## Какво включва Фаза 3

### 1. `eas.json` (нов)
Три профила:
- `development` — `developmentClient: true`, `distribution: internal` (за dev client на устройство).
- `preview` — `distribution: internal`, Android `buildType: apk` (споделим APK за тестери).
- `production` — Android `buildType: app-bundle` (AAB за Play Store).
- Глобално: `cli.appVersionSource: remote` (EAS управлява `versionCode`), `cli.version` минимална закована.
- `submit.production.android` секция с placeholder за service-account път (документиран в runbook, не се комитва ключ).

### 2. Поправки в `app.json`
- `android.package`: `com.anonymous.festivomobile` → `bg.festivo.mobile`.
- Дедупликация на `android.permissions` → само `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` веднъж.
- Добавяне на `runtimeVersion` политика за OTA: `{ "policy": "appVersion" }`.
- Добавяне на `updates.url` (EAS Update endpoint) и `extra.eas.projectId` се попълват от `eas init`/`eas update:configure` — документирано като ръчна стъпка в runbook (защото изискват акаунт и генерират стойности).

### 3. EAS Update (OTA)
- Инсталиране на `expo-updates` чрез `npx expo install`.
- Конфигурацията (`updates.url`, `projectId`) се генерира от `eas update:configure` — ръчна стъпка в runbook. Spec-ът добавя само статичните части (`runtimeVersion`), които не зависят от акаунт.

### 4. Release runbook (нов: `docs/RELEASE.md`)
Подробни стъпки за потребителя:
- Създаване на Expo акаунт + `eas login`.
- `eas init` (генерира projectId), `eas update:configure`.
- Google Play Developer акаунт ($25 еднократно).
- `eas build --platform android --profile preview` (тест APK) → `--profile production` (AAB).
- Качване в Play Console **Internal testing** track първо.
- Попълване на listing (privacy URL: `https://festivo.bg/privacy`).
- Как се пуска OTA ъпдейт: `eas update --branch production`.
- Версиониране: кога се вдига `version` vs кога стига OTA.

### 5. Play Store assets checklist (в `docs/RELEASE.md`)
Таблица какво е нужно и текущ статус:
- App icon ✓ (има), adaptive icon ✓.
- Feature graphic (1024×500) — липсва, потребителят прави.
- Screenshots (мин. 2, телефон) — потребителят прави.
- Кратко (80 знака) + пълно описание — чернова на BG в документа.
- Privacy policy URL ✓ (`festivo.bg/privacy`).
- Категория, content rating, target audience — насоки.

## Архитектура / подход
- Всичко статично и независимо от акаунт влиза като код/конфиг (eas.json, app.json fixes, expo-updates dep, runtimeVersion). Всичко, което изисква акаунт или генерира идентификатори (projectId, update url, service account), отива в runbook като ясни ръчни стъпки — за да не комитваме невалидни placeholder-и, които чупят билда.
- Без структурни промени по екрани или бизнес логика.

## Извън обхвата (нарочно)
- iOS билд / App Store (няма Apple акаунт).
- i18n (бъдеща фаза).
- Маркетинг графики/screenshots (агентът не ги генерира).
- Реално пускане на cloud билд / Play Console операции (изискват потребителски акаунти).

## Критерии за приемане (Definition of Done)
1. `eas.json` съществува, валиден по схема (`npx eas build --profile production --platform android --dry-run` или schema проверка не дава грешка за конфигурацията).
2. `npx expo config --type public` резолва без грешки; package id е `bg.festivo.mobile`; permissions без дубликати; `runtimeVersion` присъства.
3. `expo-updates` е инсталиран и съвместим със SDK 54 (`npx expo install --check` чист).
4. `docs/RELEASE.md` покрива всички ръчни стъпки до Internal testing track + OTA + asset checklist + чернова описание.
5. `npm run lint`, `npm run typecheck`, `npm run test:ci` остават зелени.

## Рискове
- `expo-updates` + `newArchEnabled` + `reactCompiler` може да изисква донастройка. Митигиране: `npx expo install` избира съвместима версия; `expo-doctor` проверка в плана.
- Смяната на package id чупи всеки вече инсталиран dev билд (преинсталиране). Приемливо — няма публикувана версия още.
- Стойности зависими от акаунт (projectId, update url) нарочно не се комитват; ако се сложат грешни, билдът ще се счупи — затова са в runbook.

## Следваща фаза (само за ориентир)
- **Фаза 4 — i18n** (когато потрябват други езици).
- **iOS release** (когато има Apple Developer акаунт).
