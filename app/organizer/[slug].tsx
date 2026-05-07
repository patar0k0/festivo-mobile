import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FestivalCard, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getOrganizerBySlug } from '@/lib/api/organizers';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

export default function OrganizerProfileScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['organizer', slug],
    queryFn: () => getOrganizerBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });

  const links = useMemo(() => {
    if (!data?.links) return [];
    const rows = [
      { key: 'website', label: 'Уебсайт', value: data.links.website },
      { key: 'facebook', label: 'Facebook', value: data.links.facebook },
      { key: 'instagram', label: 'Instagram', value: data.links.instagram },
      { key: 'tiktok', label: 'TikTok', value: data.links.tiktok },
    ];
    return rows.filter((row) => typeof row.value === 'string' && row.value.trim());
  }, [data?.links]);

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
        <Text style={styles.bodyText}>Липсва организатор.</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <View style={styles.backButtonGhost} />
        </View>
        <View style={styles.coverSkeleton} />
        <View style={styles.lineSkeletonWide} />
        <View style={styles.lineSkeleton} />
        <View style={styles.cardSkeleton} />
        <View style={styles.cardSkeleton} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.centerFill, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.bodyText}>Не успяхме да заредим организатора.</Text>
        <OutlinedActionButton label="Опитай отново" onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      data={data.festivals}
      keyExtractor={(item) => item.festivalId}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 34,
      }}
      ListHeaderComponent={
        <View style={{ paddingTop: insets.top + 10 }}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
              <Ionicons name="chevron-back" size={18} color={festivalUi.colors.text} />
              <Text style={styles.backLabel}>Назад</Text>
            </Pressable>
          </View>
          {data.cover_image_url ? (
            <ExpoImage source={{ uri: data.cover_image_url }} style={styles.coverImage} contentFit="cover" />
          ) : (
            <View style={styles.coverFallback}>
              <Text style={styles.coverFallbackEmoji}>🎪</Text>
            </View>
          )}
          <View style={styles.topSection}>
            <Text style={styles.title}>{data.name}</Text>
            {data.city ? <Text style={styles.city}>📍 {data.city}</Text> : null}
            {data.description ? <Text style={styles.description}>{data.description}</Text> : null}
            {links.length > 0 ? (
              <View style={styles.linksWrap}>
                {links.map((link) => (
                  <Pressable
                    key={link.key}
                    onPress={() => Linking.openURL(String(link.value))}
                    style={({ pressed }) => [styles.linkChip, pressed && styles.linkChipPressed]}>
                    <Text style={styles.linkChipText}>{link.label}</Text>
                    <Ionicons name="open-outline" size={14} color="#4F46E5" />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>Събития от този организатор</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.bodyText}>Все още няма качени събития.</Text>
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
  coverImage: {
    width: '100%',
    height: 180,
  },
  coverFallback: {
    height: 180,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackEmoji: {
    fontSize: 46,
  },
  topSection: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 14,
    paddingBottom: 6,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  city: {
    marginTop: 10,
    fontSize: 16,
    color: '#374151',
  },
  description: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: '#4B5563',
  },
  linksWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  linkChipPressed: {
    opacity: 0.75,
  },
  linkChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338CA',
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  bodyText: {
    fontSize: 16,
    color: festivalUi.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyState: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingVertical: 14,
  },
  coverSkeleton: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  lineSkeletonWide: {
    height: 18,
    width: '74%',
    borderRadius: 6,
    marginTop: 16,
    backgroundColor: '#E5E7EB',
  },
  lineSkeleton: {
    height: 14,
    width: '48%',
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
