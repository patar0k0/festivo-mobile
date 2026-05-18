import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getLikedFestivals, unlikeFestival } from '@/lib/api/likes';
import { formatDateRangeRelative } from '@/lib/festival/relativeDate';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';

const COLORS = festivalUi.colors;

function LikedRow({
  item,
  unliking,
  onPress,
  onUnlike,
}: {
  item: FestivalListItem;
  unliking: boolean;
  onPress: () => void;
  onUnlike: () => void;
}) {
  const range = formatDateRangeRelative(item.start_date, item.end_date);
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  return (
    <PressableScale onPress={onPress} pressedScale={0.985} pressedOpacity={0.92} style={styles.row}>
      <View style={styles.thumb}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Text style={styles.thumbEmoji}>🎉</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.city || 'България'}
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {range}
        </Text>
      </View>
      <Pressable
        onPress={onUnlike}
        disabled={unliking}
        hitSlop={10}
        style={({ pressed }) => [styles.heartBtn, pressed && !unliking && styles.heartBtnPressed]}>
        {unliking ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <AnimatedHeart filled size={22} color="#EF4444" />
        )}
      </Pressable>
    </PressableScale>
  );
}

export default function ProfileLikedFestivalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['me', 'likes'],
    queryFn: getLikedFestivals,
    staleTime: 1000 * 30,
  });

  const unlikeMutation = useMutation({
    mutationFn: (festivalId: string) => unlikeFestival(festivalId),
    onMutate: async (festivalId) => {
      setPendingIds((prev) => new Set(prev).add(festivalId));
      await queryClient.cancelQueries({ queryKey: ['me', 'likes'] });
      const prev = queryClient.getQueryData<FestivalListItem[]>(['me', 'likes']) ?? [];
      queryClient.setQueryData<FestivalListItem[]>(
        ['me', 'likes'],
        prev.filter((f) => f.festivalId !== festivalId),
      );
      return { prev };
    },
    onError: (_e, festivalId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['me', 'likes'], ctx.prev);
      setPendingIds((p) => {
        const next = new Set(p);
        next.delete(festivalId);
        return next;
      });
      Alert.alert('Грешка', 'Неуспешно премахване от харесани.');
    },
    onSuccess: (_r, festivalId) => {
      setPendingIds((p) => {
        const next = new Set(p);
        next.delete(festivalId);
        return next;
      });
    },
  });

  const handleUnlike = useCallback(
    (festivalId: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      unlikeMutation.mutate(festivalId);
    },
    [unlikeMutation],
  );

  if (isPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.text} />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.errorText}>Не успяхме да заредим харесаните.</Text>
        <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Опитай отново</Text>
        </Pressable>
      </View>
    );
  }

  const items = data ?? [];
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Харесани</Text>
        <View style={{ width: 26 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.festivalId}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={COLORS.text} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={42} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>Още нямаш харесани</Text>
            <Text style={styles.emptyHint}>
              Натисни ♥ върху страницата на фестивал, за да го запазиш тук.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <LikedRow
            item={item}
            unliking={pendingIds.has(item.festivalId)}
            onPress={() => router.push(festivalDetailHref(item.slug))}
            onUnlike={() => handleUnlike(item.festivalId)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  list: { paddingHorizontal: festivalUi.screenPadding },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  thumbEmoji: { fontSize: 26 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta: { marginTop: 4, fontSize: 13, color: '#666666' },
  date: { marginTop: 3, fontSize: 13, color: '#666666' },
  heartBtn: { padding: 6 },
  heartBtnPressed: { opacity: 0.6 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  emptyHint: { fontSize: 13, color: COLORS.secondary, textAlign: 'center' },
  errorText: { fontSize: 14, color: COLORS.secondary, marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.text,
    borderRadius: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
});
