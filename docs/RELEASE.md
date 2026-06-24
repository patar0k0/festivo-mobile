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
