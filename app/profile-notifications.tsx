import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { isExpoGo } from '@/lib/push/isExpoGo';
import { loadNotifications } from '@/lib/push/loadNotifications';
import { registerPush } from '@/lib/push/registerPush';

export default function ProfileNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [statusText, setStatusText] = useState('Зареждане…');
  /** Shown after every refresh so taps always have visible feedback (same status string skips re-render). */
  const [lastCheckedLabel, setLastCheckedLabel] = useState<string | null>(null);

  const touchLastChecked = useCallback(() => {
    setLastCheckedLabel(`Проверено: ${new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }, []);

  const refreshStatus = useCallback(async () => {
    touchLastChecked();
    if (isExpoGo) {
      setStatusText('В Expo Go push известията са ограничени. Ползвай development build за пълна поддръжка.');
      return;
    }
    const Notifications = await loadNotifications();
    if (!Notifications) {
      setStatusText('Модулът за известия не е наличен в този билд.');
      return;
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      setStatusText('Разрешено — можем да ти изпращаме напомняния за запазени фестивали.');
    } else if (status === 'denied') {
      setStatusText('Отказано — включи известията от настройките на устройството, ако искаш push.');
    } else {
      setStatusText('Още не е поискано разрешение.');
    }
  }, [touchLastChecked]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

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
        Получавай напомняния за фестивали, които си запазил. Можеш да промениш разрешението по всяко време от
        настройките на телефона.
      </Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Статус</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        {lastCheckedLabel ? <Text style={styles.lastChecked}>{lastCheckedLabel}</Text> : null}
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
});
