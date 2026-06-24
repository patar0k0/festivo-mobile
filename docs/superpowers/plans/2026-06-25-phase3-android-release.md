# Phase 3: Android Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Festivo Mobile buildable and publishable to Google Play — EAS build profiles, a correct package id, OTA updates, and a complete release runbook — without touching app behavior.

**Architecture:** Everything static and account-independent ships as committed config (`eas.json`, `app.json` fixes, `expo-updates` dep, `runtimeVersion`). Everything that needs an Expo/Google account or generates identifiers (projectId, update URL, service-account key) is documented as manual steps in `docs/RELEASE.md`, never committed as broken placeholders.

**Tech Stack:** Expo SDK 54, EAS Build, EAS Update (`expo-updates`), Google Play.

**Note:** This phase is configuration + documentation. There are no unit tests to add; each task verifies via `npx expo config`, `npx expo-doctor`, EAS schema, and confirming the existing suite (`npm run lint && npm run typecheck && npm run test:ci`) stays green.

---

## File Structure

**Created:**
- `eas.json` — EAS build/submit profiles.
- `docs/RELEASE.md` — release runbook + Play Store asset checklist + draft store listing copy.

**Modified:**
- `app.json` — package id, deduped permissions, `runtimeVersion`.
- `package.json` / `package-lock.json` — `expo-updates` dependency (via `expo install`).

---

## Task 1: Fix `app.json` (package id, permissions, runtimeVersion)

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Change the Android package id**

In `app.json`, under `expo.android`, change:
```json
      "package": "com.anonymous.festivomobile"
```
to:
```json
      "package": "bg.festivo.mobile"
```

- [ ] **Step 2: Deduplicate the Android permissions**

Replace the `expo.android.permissions` array:
```json
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ],
```
with:
```json
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ],
```

- [ ] **Step 3: Add a runtimeVersion policy (for OTA)**

In `app.json`, add a top-level `expo.runtimeVersion` key (place it right after the `"version": "1.0.0",` line):
```json
    "runtimeVersion": {
      "policy": "appVersion"
    },
```

- [ ] **Step 4: Verify the config resolves**

Run: `npx expo config --type public`
Expected: prints resolved JSON with no error; `android.package` shows `bg.festivo.mobile`; `permissions` has exactly two entries; `runtimeVersion` present.

- [ ] **Step 5: Commit**

```bash
git add app.json
git commit -m "chore(android): set release package id, dedupe permissions, add runtimeVersion"
```

---

## Task 2: Install `expo-updates` (OTA)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the SDK-aligned version**

Run: `npx expo install expo-updates`
Expected: `expo-updates` added to `dependencies` at an SDK-54-compatible version; install completes.

- [ ] **Step 2: Confirm dependency health**

Run: `npx expo install --check`
Expected: reports dependencies are up to date / compatible (no version-mismatch errors). If it offers to fix versions, accept.

- [ ] **Step 3: Verify config + tests still green**

Run: `npx expo config --type public`
Expected: resolves with no error (expo-updates auto-config does not break the manifest).

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; all suites green (no runtime code referenced expo-updates, so nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(ota): add expo-updates for EAS Update"
```

---

## Task 3: Create `eas.json`

**Files:**
- Create: `eas.json`

- [ ] **Step 1: Write `eas.json`**

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "track": "internal"
      }
    }
  }
}
```

- [ ] **Step 2: Validate the schema**

Run: `npx eas-cli@latest build:configure --platform android --non-interactive` is NOT used (it rewrites files). Instead validate by inspection + dry parse:
Run: `node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); console.log('eas.json valid JSON')"`
Expected: prints `eas.json valid JSON`.

Run: `npx expo config --type public`
Expected: still resolves with no error (eas.json does not affect app config but confirms the workspace is intact).

- [ ] **Step 3: Commit**

```bash
git add eas.json
git commit -m "build(eas): add development/preview/production Android profiles"
```

---

## Task 4: Write the release runbook

**Files:**
- Create: `docs/RELEASE.md`

- [ ] **Step 1: Write `docs/RELEASE.md`**

````markdown
# Festivo Mobile — Android Release Runbook

Стъпки за публикуване в Google Play. Конфигурацията (`eas.json`, `app.json`, `expo-updates`) вече е в репото. Тук са нещата, които изискват акаунти и се правят ръчно.

## 0. Еднократна подготовка

1. **Expo акаунт:** регистрирай се на https://expo.dev, после:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **Свържи проекта с EAS (генерира projectId):**
   ```bash
   eas init
   ```
   Това добавя `extra.eas.projectId` в `app.json` — комитни промяната.
3. **Конфигурирай EAS Update (генерира updates.url):**
   ```bash
   eas update:configure
   ```
   Добавя `updates.url` в `app.json` — комитни промяната.
4. **Google Play Developer акаунт:** $25 еднократно на https://play.google.com/console.

## 1. Тестов билд (APK)

```bash
eas build --platform android --profile preview
```
Сваля се APK линк → инсталирай на устройство за ръчен тест.

## 2. Production билд (AAB за Play Store)

```bash
eas build --platform android --profile production
```
Дава `.aab` файл (или го качва автоматично, ако е настроен submit).

## 3. Качване в Play Console

1. Play Console → създай приложение „Festivo".
2. Първо в **Internal testing** track (не direct production).
3. Качи `.aab`.
4. Попълни:
   - Privacy policy URL: `https://festivo.bg/privacy`
   - Store listing (виж чернова по-долу)
   - Content rating въпросник
   - Target audience
   - Data safety форма (приложението ползва локация + push токени)
5. Добави тестери (имейли) в internal track → разпрати линка.

## 4. OTA ъпдейти (бързи корекции след release)

За JS/UI промени **без** нов Store билд (стига native кодът да не се е променил):
```bash
eas update --branch production --message "Кратко описание"
```
Потребителите получават промяната при следващо отваряне.

**Кога стига OTA vs нов билд:**
- Само JS/TS/asset промени → OTA.
- Нов native модул, промяна в permissions, смяна на `version` → нов `eas build`.

## 5. Версиониране

- `version` в `app.json` (напр. `1.0.1`) — потребителски видима; вдигай при значими release-и.
- `versionCode` — управлява се автоматично от EAS (`appVersionSource: remote`, `autoIncrement`).
- `runtimeVersion` политика е `appVersion` — OTA ъпдейтите важат за билдове със същата `version`.

## Play Store assets checklist

| Asset | Изискване | Статус |
|---|---|---|
| App icon | 512×512 | ✓ (`assets/images/icon.png`) |
| Adaptive icon | foreground/background | ✓ (в `app.json`) |
| Feature graphic | 1024×500 | ⛔ трябва да се направи |
| Screenshots (телефон) | мин. 2, 16:9 или 9:16 | ⛔ трябва да се направят |
| Кратко описание | ≤ 80 знака | чернова по-долу |
| Пълно описание | ≤ 4000 знака | чернова по-долу |
| Privacy policy URL | публичен линк | ✓ `https://festivo.bg/privacy` |
| Категория | напр. Events | избери в Console |
| Content rating | въпросник | попълни в Console |

## Чернова на listing (BG)

**Кратко описание (≤80):**
> Открий фестивали в България, планирай програмата си и следи организатори.

**Пълно описание (чернова):**
> Festivo е твоят спътник за фестивали в България. Разглеждай предстоящи събития на карта, запазвай любими, планирай личната си програма и получавай известия за нови фестивали от организаторите, които следваш.
>
> • Откривай фестивали по град, категория и дата
> • Запазвай и планирай програмата си — дори офлайн
> • Следи организатори и получавай известия
> • Виж събитията на интерактивна карта
>
> Планирай следващото си фестивално преживяване с Festivo.
````

- [ ] **Step 2: Verify the doc is valid Markdown and committed-ready**

Run: `node -e "const s=require('fs').readFileSync('docs/RELEASE.md','utf8'); if(!s.includes('festivo.bg/privacy')) throw new Error('privacy url missing'); console.log('RELEASE.md ok, '+s.length+' chars')"`
Expected: prints `RELEASE.md ok, <N> chars`.

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASE.md
git commit -m "docs: add Android release runbook and Play Store checklist"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Dependency + config health**

Run: `npx expo-doctor`
Expected: passes, or only warns about items already known (e.g. unrelated). No errors about `expo-updates`, package id, or manifest. If `expo-doctor` flags a real issue introduced by this phase, fix it before continuing.

- [ ] **Step 2: Quality gate still green**

Run: `npm run lint && npm run typecheck && npm run test:ci`
Expected: lint 0 errors; typecheck exits 0; all tests pass with coverage threshold met.

- [ ] **Step 3: Confirm resolved Android identity**

Run: `npx expo config --type public`
Expected: `android.package` = `bg.festivo.mobile`; `runtimeVersion` present; permissions deduped.

- [ ] **Step 4: Commit (if expo-doctor required any fix)**

```bash
git add -A
git commit -m "chore(release): resolve expo-doctor findings" || echo "nothing to commit"
```

---

## Definition of Done (verify before declaring complete)

- [ ] `eas.json` exists with development/preview/production profiles and is valid JSON.
- [ ] `app.json`: package id `bg.festivo.mobile`, permissions deduped, `runtimeVersion` policy present.
- [ ] `expo-updates` installed and SDK-54-compatible (`npx expo install --check` clean).
- [ ] `docs/RELEASE.md` covers account setup, builds, Internal testing upload, OTA, versioning, asset checklist, and draft BG listing.
- [ ] `npx expo config` resolves; `npx expo-doctor` has no new errors.
- [ ] `npm run lint && npm run typecheck && npm run test:ci` all green.
- [ ] Account-dependent values (projectId, updates.url, service-account key) are NOT committed — they live as manual steps in `docs/RELEASE.md`.
