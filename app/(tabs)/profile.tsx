import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { useAuth } from '@/lib/auth/useAuth';

const SETTINGS_ROWS: { key: string; label: string }[] = [
  { key: 'inbox', label: 'Входящи известия' },
  { key: 'notifications', label: 'Известия' },
  { key: 'about', label: 'За приложението' },
  { key: 'privacy', label: 'Политика за поверителност' },
  { key: 'version', label: 'Версия 1.0.0' },
];

const SETTINGS_ROUTE_BY_KEY: Record<string, string> = {
  inbox: '/profile-inbox',
  notifications: '/profile-notifications',
  about: '/profile-about',
  privacy: '/profile-privacy',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, loading } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.brandBlock}>
        <Text style={styles.brandTitle}>Festivo</Text>
        <Text style={styles.brandSubtitle}>Откривай събития в България</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={44} color={festivalUi.colors.secondary} />
          <View style={styles.meta}>
            <Text style={styles.label}>Влязъл като</Text>
            <Text style={styles.email} numberOfLines={2}>
              {loading ? '…' : user?.email ?? '—'}
            </Text>
          </View>
        </View>
        <OutlinedActionButton label="Изход" onPress={() => void logout()} />
      </View>

      <View style={styles.settingsCard}>
        {SETTINGS_ROWS.map((row, index) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            onPress={() => {
              const navigateTo = SETTINGS_ROUTE_BY_KEY[row.key] ?? null;
              if (navigateTo) {
                router.push(navigateTo as Href);
              }
            }}
            style={({ pressed }) => [
              styles.settingsRow,
              index < SETTINGS_ROWS.length - 1 && styles.settingsRowBorder,
              pressed && styles.settingsRowPressed,
            ]}>
            <Text style={styles.settingsRowLabel}>{row.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: festivalUi.screenPadding,
  },
  brandBlock: {
    marginBottom: 28,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: festivalUi.colors.text,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    color: '#8B92A3',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    color: festivalUi.colors.secondary,
    fontWeight: '500',
  },
  email: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  settingsCard: {
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  settingsRowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: festivalUi.colors.text,
  },
  settingsRowPressed: {
    opacity: 0.75,
    backgroundColor: '#F6F7F9',
  },
});
