import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import { useAuth } from '@/lib/auth/useAuth';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, loading } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <Text style={[festivalUi.typography.sectionTitle, styles.title]}>Профил</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: festivalUi.screenPadding,
  },
  title: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
});
