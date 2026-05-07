import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FestivalCard, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getOrganizerBySlug } from '@/lib/api/organizers';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

type LinkKey = 'website' | 'facebook' | 'instagram' | 'tiktok';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

type OrganizerLinkRow = {
  key: LinkKey;
  label: string;
  value: string;
  url: string;
  icon: IoniconName;
};

const LINK_ROWS: Array<{ key: LinkKey; label: string; icon: IoniconName }> = [
  { key: 'website', label: 'Уебсайт', icon: 'globe-outline' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { key: 'tiktok', label: 'TikTok', icon: 'musical-notes-outline' },
];

function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toLocaleUpperCase('bg-BG') ?? '').join('');
  return initials || 'F';
}

export default function OrganizerProfileScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['organizer', slug],
    queryFn: () => getOrganizerBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });

  const links = useMemo(() => {
    if (!data?.links) return [];
    return LINK_ROWS.reduce<OrganizerLinkRow[]>((acc, row) => {
      const value = data.links?.[row.key];
      if (typeof value !== 'string' || !value.trim()) return acc;
      acc.push({ ...row, value: value.trim(), url: normalizeExternalUrl(value) });
      return acc;
    }, []);
  }, [data?.links]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  const onToggleSave = (item: FestivalListItem) => {
    const id = item.festivalId;
    setPendingIds((prev) => new Set(prev).add(id));
    toggleSavedMutation.mutate(
      { festivalId: item.festivalId, slug: item.slug, festival: item },
      {
        onSettled: () => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    );
  };

  if (!slug) {
    return (
      <View style={[styles.centerFill, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.errorTitle}>Липсва организатор.</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <View style={styles.backButtonGhost} />
        </View>
        <View style={styles.heroSkeleton}>
          <View style={styles.avatarSkeleton} />
          <View style={styles.heroLineSkeletonWide} />
          <View style={styles.heroLineSkeleton} />
        </View>
        <View style={styles.infoSkeleton}>
          <View style={styles.lineSkeletonWide} />
          <View style={styles.lineSkeleton} />
          <View style={styles.lineSkeletonShort} />
        </View>
        <View style={styles.cardSkeleton} />
        <View style={styles.cardSkeleton} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.centerFill, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={festivalUi.colors.muted} style={styles.errorIcon} />
        <Text style={styles.errorTitle}>Не успяхме да заредим организатора.</Text>
        <Text style={styles.errorSubtitle}>Провери връзката и опитай отново.</Text>
        <OutlinedActionButton label="Опитай отново" onPress={() => refetch()} />
      </View>
    );
  }

  const description = data.description?.trim();
  const hasCover = Boolean(data.cover_image_url);
  const hasLogo = Boolean(data.logo_url);
  const initials = getInitials(data.name);

  return (
    <FlatList
      data={data.festivals}
      keyExtractor={(item) => item.festivalId}
      extraData={pendingIds}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 34,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={festivalUi.colors.text}
          colors={[festivalUi.colors.text]}
        />
      }
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
              <Ionicons name="chevron-back" size={18} color={festivalUi.colors.text} />
              <Text style={styles.backLabel}>Назад</Text>
            </Pressable>
          </View>
          <View style={styles.heroCard}>
            {hasCover && data.cover_image_url ? (
              <>
                <ExpoImage
                  source={{ uri: data.cover_image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={180}
                  cachePolicy="memory-disk"
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(17,24,39,0.08)', 'rgba(17,24,39,0.32)', 'rgba(17,24,39,0.74)']}
                  locations={[0, 0.48, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroTextOverlay}>
                  <Text style={styles.heroTitleImage} numberOfLines={2}>
                    {data.name}
                  </Text>
                  {data.city ? (
                    <View style={styles.heroCityPill}>
                      <Ionicons name="location-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.heroCityText} numberOfLines={1}>
                        {data.city}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : (
              <LinearGradient colors={['#FDF2F8', '#EEF2FF', '#ECFDF5']} style={styles.coverFallback}>
                <View style={styles.avatarWrap}>
                  {hasLogo && data.logo_url ? (
                    <ExpoImage source={{ uri: data.logo_url }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  )}
                </View>
                <Text style={styles.heroTitleFallback} numberOfLines={2}>
                  {data.name}
                </Text>
                {data.city ? (
                  <View style={styles.fallbackCityRow}>
                    <Ionicons name="location-outline" size={15} color={festivalUi.colors.secondary} />
                    <Text style={styles.fallbackCityText} numberOfLines={1}>
                      {data.city}
                    </Text>
                  </View>
                ) : null}
              </LinearGradient>
            )}
          </View>
          <View style={styles.topSection}>
            {description ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>За организатора</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
            ) : null}
            {links.length > 0 ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Връзки</Text>
                <View style={styles.linksList}>
                  {links.map((link) => (
                    <Pressable
                      key={link.key}
                      onPress={() => {
                        void Linking.openURL(link.url);
                      }}
                      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}>
                      <View style={styles.linkIconWrap}>
                        <Ionicons name={link.icon} size={18} color={festivalUi.colors.text} />
                      </View>
                      <View style={styles.linkTextWrap}>
                        <Text style={styles.linkLabel}>{link.label}</Text>
                        <Text style={styles.linkValue} numberOfLines={1}>
                          {link.value}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={festivalUi.colors.secondary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Събития от този организатор</Text>
              {data.festivals.length > 0 ? (
                <Text style={styles.sectionCount}>
                  {data.festivals.length}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={42} color={festivalUi.colors.muted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Все още няма качени събития.</Text>
          <Text style={styles.emptySubtitle}>Когато този организатор публикува фестивали, ще ги видиш тук.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.cardWrap}>
          <FestivalCard
            variant="compact"
            item={item}
            onPressCard={() => router.push(`/festival/${item.slug}`)}
            onPressSave={() => onToggleSave(item)}
            saveDisabled={pendingIds.has(item.festivalId)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: festivalUi.screenPadding,
  },
  listContent: {
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    paddingHorizontal: festivalUi.screenPadding,
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  backButtonGhost: {
    width: 80,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  backLabel: {
    color: festivalUi.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  heroCard: {
    height: 244,
    marginHorizontal: festivalUi.screenPadding,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  heroTextOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  heroTitleImage: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
  },
  heroCityPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroCityText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: festivalUi.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  heroTitleFallback: {
    marginTop: 16,
    color: festivalUi.colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    textAlign: 'center',
  },
  fallbackCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  fallbackCityText: {
    color: festivalUi.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  topSection: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 16,
    paddingBottom: 2,
    gap: 14,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  description: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 25,
    color: '#374151',
  },
  linksList: {
    marginTop: 10,
    gap: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 15,
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  linkRowPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  linkIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  linkTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  linkLabel: {
    color: festivalUi.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  linkValue: {
    marginTop: 3,
    color: festivalUi.colors.secondary,
    fontSize: 13,
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    color: festivalUi.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
  },
  sectionCount: {
    minWidth: 34,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#111827',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardWrap: {
    paddingHorizontal: festivalUi.screenPadding,
    marginBottom: 14,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: festivalUi.screenPadding,
    backgroundColor: '#FFFFFF',
  },
  errorIcon: {
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: festivalUi.colors.text,
    textAlign: 'center',
  },
  errorSubtitle: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 15,
    lineHeight: 22,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
  },
  emptyState: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingVertical: 30,
    alignItems: 'center',
    marginHorizontal: festivalUi.screenPadding,
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyTitle: {
    color: festivalUi.colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    color: festivalUi.colors.secondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  heroSkeleton: {
    height: 244,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarSkeleton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#E5E7EB',
  },
  heroLineSkeletonWide: {
    height: 22,
    width: '70%',
    borderRadius: 8,
    marginTop: 18,
    backgroundColor: '#E5E7EB',
  },
  heroLineSkeleton: {
    height: 14,
    width: '44%',
    borderRadius: 7,
    marginTop: 10,
    backgroundColor: '#E5E7EB',
  },
  infoSkeleton: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  lineSkeletonWide: {
    height: 18,
    width: '78%',
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  lineSkeleton: {
    height: 14,
    width: '58%',
    borderRadius: 6,
    marginTop: 12,
    backgroundColor: '#E5E7EB',
  },
  lineSkeletonShort: {
    height: 14,
    width: '38%',
    borderRadius: 6,
    marginTop: 10,
    backgroundColor: '#E5E7EB',
  },
  cardSkeleton: {
    height: 132,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});
