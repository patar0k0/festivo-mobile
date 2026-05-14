import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi } from '@/components/ui/FestivalCard';
import { useAuth } from '@/lib/auth/useAuth';
import { getFollowedOrganizers } from '@/lib/api/followedOrganizers';
import { fetchInboxPage } from '@/lib/push/inbox';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';

type SettingsRow = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Optional badge text shown right-aligned (count, "Нов" etc). */
  badge?: string | null;
  /** When `true` the badge is rendered as an attention dot in addition to the text. */
  attention?: boolean;
  href?: Href;
};

type SettingsGroup = {
  key: string;
  title: string;
  rows: SettingsRow[];
};

const AVATAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#6366F1', '#8B5CF6'],
  ['#10B981', '#14B8A6'],
  ['#F59E0B', '#EF4444'],
  ['#EC4899', '#F43F5E'],
  ['#0EA5E9', '#6366F1'],
];

function initialsFromEmail(email?: string | null): string {
  if (!email) return '?';
  const localPart = email.split('@')[0] ?? '';
  const tokens = localPart.split(/[._\-+]/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0]![0]! + tokens[1]![0]!).toUpperCase();
  }
  if (tokens[0] && tokens[0].length >= 2) {
    return tokens[0]!.slice(0, 2).toUpperCase();
  }
  return (tokens[0]?.[0] ?? email[0] ?? '?').toUpperCase();
}

function avatarColorIndex(seed?: string | null): number {
  if (!seed) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_GRADIENTS.length;
}

function formatMemberSinceBg(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  return `Член от ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function StatTile({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const formatted = Intl.NumberFormat('bg-BG').format(value);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.statTile, pressed && onPress ? styles.statTilePressed : null]}>
      <Text style={styles.statValue}>{formatted}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function SettingsGroupView({
  group,
  onPressRow,
  onLongPressRow,
}: {
  group: SettingsGroup;
  onPressRow: (row: SettingsRow) => void;
  onLongPressRow?: (row: SettingsRow) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      <View style={styles.groupCard}>
        {group.rows.map((row, idx) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            onPress={() => onPressRow(row)}
            onLongPress={onLongPressRow ? () => onLongPressRow(row) : undefined}
            delayLongPress={700}
            style={({ pressed }) => [
              styles.row,
              idx < group.rows.length - 1 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}>
            <View style={styles.rowIconWrap}>
              <Ionicons name={row.icon} size={18} color={festivalUi.colors.text} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {row.label}
            </Text>
            {row.badge ? (
              <View style={[styles.badge, row.attention && styles.badgeAttention]}>
                <Text style={[styles.badgeText, row.attention && styles.badgeTextAttention]}>{row.badge}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const debugPressRef = useRef({ count: 0, firstAt: 0 });

  const planQuery = useMobilePlanState();
  const followedQuery = useQuery({
    queryKey: ['followedOrganizers'],
    queryFn: getFollowedOrganizers,
    staleTime: 1000 * 60 * 5,
  });
  const inboxQuery = useQuery({
    queryKey: ['inboxFirstPage'],
    queryFn: () => fetchInboxPage(null, 20),
    staleTime: 1000 * 30,
  });

  const followedCount = followedQuery.data?.length ?? 0;
  const unreadCount = useMemo(() => {
    const items = inboxQuery.data?.items ?? [];
    return items.reduce((acc, item) => (item.unread ? acc + 1 : acc), 0);
  }, [inboxQuery.data]);
  const savedFestivalCount = planQuery.stats.savedFestivalCount;

  const email = user?.email ?? null;
  const initials = useMemo(() => initialsFromEmail(email), [email]);
  const gradient = AVATAR_GRADIENTS[avatarColorIndex(email)];
  const memberSince = formatMemberSinceBg(user?.created_at);

  const groups = useMemo<SettingsGroup[]>(
    () => [
      {
        key: 'interests',
        title: 'Моите интереси',
        rows: [
          {
            key: 'following',
            label: 'Следвани организатори',
            icon: 'people-outline',
            badge: followedCount > 0 ? String(followedCount) : null,
            href: '/profile-following-organizers' as Href,
          },
          {
            key: 'onboarding',
            label: 'Персонализация',
            icon: 'sparkles-outline',
            href: '/onboarding' as Href,
          },
        ],
      },
      {
        key: 'notifications',
        title: 'Известия',
        rows: [
          {
            key: 'inbox',
            label: 'Входящи известия',
            icon: 'mail-outline',
            badge: unreadCount > 0 ? String(unreadCount) : null,
            attention: unreadCount > 0,
            href: '/profile-inbox' as Href,
          },
          {
            key: 'notifications',
            label: 'Настройки на известията',
            icon: 'notifications-outline',
            href: '/profile-notifications' as Href,
          },
        ],
      },
      {
        key: 'app',
        title: 'Приложение',
        rows: [
          {
            key: 'about',
            label: 'За приложението',
            icon: 'information-circle-outline',
            href: '/profile-about' as Href,
          },
          {
            key: 'privacy',
            label: 'Политика за поверителност',
            icon: 'shield-checkmark-outline',
            href: '/profile-privacy' as Href,
          },
        ],
      },
    ],
    [followedCount, unreadCount],
  );

  const handleResetOnboarding = useCallback(() => {
    Alert.alert(
      'Нулирай персонализацията?',
      'Onboarding-а ще се появи отново.',
      [
        { text: 'Отказ', style: 'cancel' },
        {
          text: 'Нулирай',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('festivo.onboarding.v1');
            router.replace('/onboarding');
          },
        },
      ],
    );
  }, [router]);

  const handleVersionLongPress = useCallback(() => {
    const now = Date.now();
    const current = debugPressRef.current;
    if (!current.firstAt || now - current.firstAt > 5_000) {
      current.count = 0;
      current.firstAt = now;
    }
    current.count += 1;
    if (current.count >= 5) {
      current.count = 0;
      current.firstAt = 0;
      router.push('/internal-debug' as Href);
    }
  }, [router]);

  const handleLogout = useCallback(() => {
    Alert.alert('Изход', 'Сигурен ли си, че искаш да излезеш?', [
      { text: 'Отказ', style: 'cancel' },
      { text: 'Изход', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}>
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.avatar, { backgroundColor: gradient[0] }]}>
            <View style={[styles.avatarGradientOverlay, { backgroundColor: gradient[1], opacity: 0.55 }]} />
            <Text style={styles.avatarInitials}>{loading ? '…' : initials}</Text>
          </View>
          <View style={styles.heroIdentity}>
            <Text style={styles.heroEmail} numberOfLines={1}>
              {loading ? 'Зарежда…' : email ?? '—'}
            </Text>
            {memberSince ? <Text style={styles.heroSub}>{memberSince}</Text> : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatTile
            value={savedFestivalCount}
            label="В плана"
            onPress={() => router.push('/(tabs)/plan' as Href)}
          />
          <View style={styles.statsDivider} />
          <StatTile
            value={followedCount}
            label="Следвам"
            onPress={() => router.push('/profile-following-organizers' as Href)}
          />
          <View style={styles.statsDivider} />
          <StatTile
            value={unreadCount}
            label={unreadCount === 1 ? 'Известие' : 'Известия'}
            onPress={() => router.push('/profile-inbox' as Href)}
          />
        </View>
      </View>

      {groups.map((group) => (
        <SettingsGroupView
          key={group.key}
          group={group}
          onPressRow={(row) => {
            if (row.href) router.push(row.href);
          }}
        />
      ))}

      <View style={styles.bottomActions}>
        <Pressable
          onPress={handleLogout}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.logoutLink, pressed && styles.logoutLinkPressed]}>
          <Ionicons name="log-out-outline" size={16} color="#B91C1C" />
          <Text style={styles.logoutText}>Изход</Text>
        </Pressable>

        <Pressable
          onLongPress={handleVersionLongPress}
          delayLongPress={700}
          accessibilityRole="text"
          style={styles.versionWrap}>
          <Text style={styles.versionText}>Festivo 1.0.0</Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleResetOnboarding}
            style={({ pressed }) => [styles.devResetBtn, pressed && styles.devResetBtnPressed]}>
            <Text style={styles.devResetText}>Dev · нулирай onboarding</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: {
    paddingHorizontal: festivalUi.screenPadding,
    gap: 18,
  },

  // Hero identity card
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroEmail: {
    fontSize: 17,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  heroSub: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statTilePressed: { opacity: 0.6 },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: festivalUi.colors.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },

  // Groups
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: festivalUi.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF2F7',
  },
  rowPressed: {
    backgroundColor: '#F6F7F9',
  },
  rowIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  badgeAttention: {
    backgroundColor: '#DC2626',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  badgeTextAttention: {
    color: '#FFFFFF',
  },

  // Bottom area
  bottomActions: {
    marginTop: 8,
    alignItems: 'center',
    gap: 12,
  },
  logoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  logoutLinkPressed: { opacity: 0.6 },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B91C1C',
  },
  versionWrap: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  devResetBtn: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  devResetBtnPressed: { opacity: 0.6 },
  devResetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
});
