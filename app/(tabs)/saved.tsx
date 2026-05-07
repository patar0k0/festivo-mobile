import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FestivalCard, festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getSavedFestivals } from '@/lib/api/saved';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['savedFestivals'],
    queryFn: () => getSavedFestivals(),
  });

  const savedItems: FestivalListItem[] = (data ?? []).map((item: Record<string, unknown>) => ({
    festivalId: String(item.festivalId ?? item.id ?? item.festival_id ?? ''),
    title: String(item.title ?? ''),
    slug: String(item.slug ?? ''),
    city: String(item.city ?? ''),
    start_date: String(item.start_date ?? ''),
    end_date: item.end_date != null ? String(item.end_date) : undefined,
    image_url:
      typeof item.image_url === 'string'
        ? item.image_url
        : typeof item.imageUrl === 'string'
          ? item.imageUrl
          : undefined,
    saved: true,
  }));

  const validItems = savedItems.filter((i) => i.festivalId && i.slug);

  const onRemove = (item: FestivalListItem) => {
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

  if (isPending) {
    return (
      <View style={[styles.screenContent, { paddingTop: insets.top + 12 }]}>
        <Text style={[festivalUi.typography.secondary, styles.loadingTitle]}>Зареждане на запазени…</Text>
        <View style={styles.skeletonCard} />
        <View style={[styles.skeletonCard, styles.skeletonSpacer]} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.screenContent, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.bodyText}>Не успяхме да заредим запазените събития.</Text>
        <Text style={[festivalUi.typography.secondary, styles.subText]}>Опитай отново.</Text>
        <OutlinedActionButton label="Опитай отново" onPress={() => refetch()} />
      </View>
    );
  }

  if (validItems.length === 0) {
    return (
      <View
        style={[
          styles.emptyScreen,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}>
        <View style={styles.emptyInner}>
          <Ionicons name="bookmark-outline" size={64} color={festivalUi.colors.muted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Нямаш запазени събития</Text>
          <Text style={styles.emptySubtitle}>Натисни 🔖 на събитие, за да го запазиш</Text>
          <Pressable
            onPress={() => router.push('/')}
            style={({ pressed }) => [styles.primaryCta, pressed && styles.primaryCtaPressed]}>
            <Text style={styles.primaryCtaText}>Разгледай събития</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={validItems}
      keyExtractor={(item) => item.festivalId}
      contentContainerStyle={[
        styles.listContent,
        {
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 56,
        },
      ]}
      ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
      extraData={pendingIds}
      ListHeaderComponent={
        <Text style={[festivalUi.typography.sectionTitle, styles.listHeader]}>Запазени</Text>
      }
      renderItem={({ item }) => (
        <FestivalCard
          variant="compact"
          item={item}
          onPressCard={() => router.push(`/festival/${item.slug}`)}
          onPressSave={() => onRemove(item)}
          saveDisabled={pendingIds.has(item.festivalId)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: festivalUi.screenPadding,
  },
  emptyScreen: {
    flex: 1,
    paddingHorizontal: festivalUi.screenPadding,
    justifyContent: 'center',
  },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 40,
    minHeight: 320,
  },
  cardSeparator: {
    height: 20,
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: festivalUi.colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: festivalUi.colors.secondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  primaryCta: {
    marginTop: 28,
    backgroundColor: festivalUi.colors.text,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  primaryCtaPressed: {
    opacity: 0.88,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: festivalUi.screenPadding,
  },
  listHeader: {
    marginBottom: 12,
  },
  loadingTitle: {
    marginBottom: 16,
  },
  skeletonCard: {
    height: 140,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  skeletonSpacer: {
    marginTop: 12,
  },
  bodyText: {
    fontSize: 16,
    color: festivalUi.colors.text,
    fontWeight: '500',
  },
  subText: {
    marginTop: 6,
  },
});
