import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { apiFetch } from '@/lib/api/client';
import { isExpoGo } from '@/lib/push/isExpoGo';
import {
  getPushPermissionState,
  type PushPermissionState,
  registerPush,
  requestPushPermission,
} from '@/lib/push/registerPush';

type NotificationSettingsPayload = {
  push_enabled: boolean;
  notify_plan_reminders: boolean;
  notify_nearby_discovery: boolean;
  notify_followed_organizers: boolean;
  notify_trending_alerts: boolean;
};

const DEFAULT_SETTINGS: NotificationSettingsPayload = {
  push_enabled: true,
  notify_plan_reminders: true,
  notify_nearby_discovery: true,
  notify_followed_organizers: true,
  notify_trending_alerts: true,
};

export default function ProfileNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [permissionState, setPermissionState] = useState<PushPermissionState>('undetermined');
  const [settings, setSettings] = useState<NotificationSettingsPayload>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  /** Shown after every refresh so taps always have visible feedback (same status string skips re-render). */
  const [lastCheckedLabel, setLastCheckedLabel] = useState<string | null>(null);

  const touchLastChecked = useCallback(() => {
    setLastCheckedLabel(`Проверено: ${new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }, []);

  const refreshStatus = useCallback(async () => {
    touchLastChecked();
    if (isExpoGo) {
      setPermissionState('unavailable');
      return;
    }
    const status = await getPushPermissionState();
    setPermissionState(status);
  }, [touchLastChecked]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notification-settings');
      if (!res.ok) return;
      const json = (await res.json()) as { settings?: Partial<NotificationSettingsPayload> };
      if (!json.settings) return;
      setSettings((prev) => ({
        ...prev,
        ...json.settings,
      }));
    } catch {
      // best effort read
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void loadSettings();
  }, [loadSettings, refreshStatus]);

  const statusText = useMemo(() => {
    if (permissionState === 'granted') {
      return 'Разрешено — push известията са активни за този телефон.';
    }
    if (permissionState === 'denied') {
      return 'Отказано — включи известията от системните настройки на устройството.';
    }
    if (permissionState === 'unavailable') {
      return 'В този билд push известията не са налични (използвай development build).';
    }
    return 'Още не е поискано разрешение за push.';
  }, [permissionState]);

  const persistSettings = useCallback(async (next: Partial<NotificationSettingsPayload>) => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/notification-settings', undefined, {
        method: 'POST',
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        throw new Error('save_failed');
      }
      setSettings((prev) => ({ ...prev, ...next }));
    } catch {
      Alert.alert('Грешка', 'Не успяхме да запазим предпочитанията. Опитай отново.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const onToggle = useCallback(
    (key: keyof NotificationSettingsPayload, value: boolean) => {
      void persistSettings({ [key]: value } as Partial<NotificationSettingsPayload>);
    },
    [persistSettings],
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 12, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled>
      <Text style={styles.lead}>
        Избери кои известия искаш да получаваш. Използваме предпочитанията ти, за да пращаме само релевантни push
        известия.
      </Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Статус</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        {lastCheckedLabel ? <Text style={styles.lastChecked}>{lastCheckedLabel}</Text> : null}
      </View>
      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>Общи</Text>
        <SettingRow
          title="Push известия"
          subtitle="Главен превключвател за всички push известия"
          value={settings.push_enabled}
          disabled={isSaving}
          onValueChange={(value) => onToggle('push_enabled', value)}
        />
      </View>
      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>Персонализация</Text>
        <SettingRow
          title="Напомняния за запазени фестивали"
          subtitle="Утре / след няколко часа за запазените от теб събития"
          value={settings.notify_plan_reminders}
          disabled={isSaving || !settings.push_enabled}
          onValueChange={(value) => onToggle('notify_plan_reminders', value)}
        />
        <SettingRow
          title="Фестивали наблизо"
          subtitle="Уикенд идеи по следвани градове и твоя град"
          value={settings.notify_nearby_discovery}
          disabled={isSaving || !settings.push_enabled}
          onValueChange={(value) => onToggle('notify_nearby_discovery', value)}
        />
        <SettingRow
          title="Организатори, които следваш"
          subtitle="Нови фестивали от любими организатори"
          value={settings.notify_followed_organizers}
          disabled={isSaving || !settings.push_enabled}
          onValueChange={(value) => onToggle('notify_followed_organizers', value)}
        />
        <SettingRow
          title="Трендинг тази седмица"
          subtitle="Популярни фестивали с висока активност"
          value={settings.notify_trending_alerts}
          disabled={isSaving || !settings.push_enabled}
          onValueChange={(value) => onToggle('notify_trending_alerts', value)}
        />
      </View>
      <OutlinedActionButton
        label="Обнови статуса"
        onPress={() => {
          void refreshStatus();
        }}
      />
      <Pressable
        hitSlop={12}
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        onPress={() => {
          void requestPushPermission().then((state) => {
            setPermissionState(state);
            if (state === 'denied') {
              Alert.alert(
                'Разрешението е отказано',
                'Отвори настройките на устройството и позволи известия за Festivo.',
              );
            }
          });
        }}>
        <Text style={styles.secondaryBtnText}>Поискай разрешение отново</Text>
      </Pressable>
      {permissionState === 'denied' ? (
        <Pressable
          hitSlop={12}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          onPress={() => {
            void Linking.openSettings();
          }}>
          <Text style={styles.secondaryBtnText}>Отвори системни настройки</Text>
        </Pressable>
      ) : null}
      <Pressable
        hitSlop={12}
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        onPress={() => {
          if (isExpoGo) {
            Alert.alert(
              'Expo Go',
              'Регистрацията за push не е налична в Expo Go. Направи development build (EAS), за да тестваш известията.',
            );
            touchLastChecked();
            return;
          }
          void registerPush().finally(() => {
            void refreshStatus();
          });
        }}>
        <Text style={styles.secondaryBtnText}>Регистрирай за push (след разрешение)</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingRow({
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: '#D1D5DB', true: '#6366F1' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F4F5F8',
  },
  content: {
    paddingHorizontal: festivalUi.screenPadding,
    gap: 16,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    color: festivalUi.colors.text,
  },
  statusBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: festivalUi.colors.text,
  },
  lastChecked: {
    marginTop: 10,
    fontSize: 13,
    color: festivalUi.colors.secondary,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  secondaryBtnPressed: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4F46E5',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
    gap: 14,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: festivalUi.colors.text,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextWrap: {
    flex: 1,
    gap: 4,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  settingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: festivalUi.colors.secondary,
  },
});
