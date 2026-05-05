import { Ionicons } from '@expo/vector-icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { ListRenderItemInfo, SectionListRenderItemInfo } from 'react-native';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivals, getFestivalBySlug } from '@/lib/api/festivals';
import { festivalUi } from '@/components/ui/FestivalCard';
import { queryClient } from '@/lib/queryClient';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

const COLORS = festivalUi.colors;

const FESTIVAL_PLACEHOLDER = require('@/assets/images/festival-placeholder.png');

type SectionKey = 'week' | 'popular';

type HomeSection = {
  key: SectionKey;
  title: string;
  data: FestivalListItem[];
};

function formatShortDate(iso: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
}

function formatDateRange(start: string, end?: string | null): string {
  const a = formatShortDate(start);
  if (!end?.trim() || end === start) return a;
  return `${a} – ${formatShortDate(end)}`;
}

function TrendingItemSeparator() {
  return <View style={styles.trendingItemSep} />;
}

function TrendingSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View style={[styles.trendingFlatListContent, styles.trendingSkeletonRow]}>
      {[0, 1].map((k) => (
        <View key={k} style={[styles.trendingSkeletonCard, { width: cardWidth }]} />
      ))}
    </View>
  );
}

function WeekSkeletonRow() {
  return (
    <View style={styles.compactSkeletonRow}>
      <View style={styles.compactSkeletonThumb} />
      <View style={styles.compactSkeletonBody}>
        <View style={styles.skeletonLineLg} />
        <View style={styles.skeletonLineSm} />
        <View style={styles.skeletonLineMd} />
      </View>
    </View>
  );
}

function PopularSkeletonRow() {
  return (
    <View style={styles.popularSkeletonRow}>
      <View style={styles.popularSkeletonAccent} />
      <View style={styles.popularSkeletonInner}>
        <View style={styles.compactSkeletonThumb} />
        <View style={styles.compactSkeletonBody}>
          <View style={styles.skeletonLineLg} />
          <View style={styles.skeletonLineSm} />
        </View>
      </View>
    </View>
  );
}

function HomeHeader({ onSearchPress }: { onSearchPress: () => void }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerTitles}>
        <Text style={styles.headerTitle}>Festivo</Text>
        <Text style={styles.headerSubtitle}>Събития в България</Text>
      </View>
      <Pressable
        onPress={onSearchPress}
        hitSlop={12}
        style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}>
        <Ionicons name="search-outline" size={26} color={COLORS.text} />
      </Pressable>
    </View>
  );
}

function TrendingCard({
  item,
  width,
  onPressCard,
  onPressSave,
  saveDisabled,
}: {
  item: FestivalListItem;
  width: number;
  onPressCard: () => void;
  onPressSave: () => void;
  saveDisabled?: boolean;
}) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const dateLabel = formatShortDate(item.start_date);

  return (
    <Pressable onPress={onPressCard} style={[styles.trendingCard, { width }]}>
      <Image
        source={uri ? { uri } : FESTIVAL_PLACEHOLDER}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={180}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
        locations={[0, 0.4, 1]}
        style={styles.trendingGradient}
      />
      <Pressable
        disabled={saveDisabled}
        onPress={onPressSave}
        style={({ pressed }) => [
          styles.trendingSaveBtn,
          saveDisabled && styles.saveBtnDisabled,
          pressed && !saveDisabled && styles.trendingSaveBtnPressed,
        ]}
        hitSlop={8}>
        <Ionicons name={item.saved ? 'bookmark' : 'bookmark-outline'} size={22} color="#FFFFFF" />
      </Pressable>
      <View style={styles.trendingTextBlock}>
        <Text style={styles.trendingTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.trendingMeta} numberOfLines={1}>
          {item.city || 'България'}
        </Text>
        <Text style={styles.trendingMeta} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function CompactWeekCard({
  item,
  onPressCard,
  onPressSave,
  saveDisabled,
}: {
  item: FestivalListItem;
  onPressCard: () => void;
  onPressSave: () => void;
  saveDisabled?: boolean;
}) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const range = formatDateRange(item.start_date, item.end_date);

  return (
    <Pressable onPress={onPressCard} style={({ pressed }) => [styles.compactCard, pressed && styles.cardPressed]}>
      <Image
        source={uri ? { uri } : FESTIVAL_PLACEHOLDER}
        style={styles.compactThumb}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
      <View style={styles.compactBody}>
        <Text style={styles.compactTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.compactMeta} numberOfLines={1}>
          {item.city || 'България'}
        </Text>
        <Text style={styles.compactDate} numberOfLines={1}>
          {range}
        </Text>
      </View>
      <Pressable
        disabled={saveDisabled}
        onPress={onPressSave}
        style={({ pressed }) => [
          styles.compactSave,
          saveDisabled && styles.saveBtnDisabled,
          pressed && !saveDisabled && styles.iconPressed,
        ]}
        hitSlop={10}>
        <Ionicons
          name={item.saved ? 'bookmark' : 'bookmark-outline'}
          size={22}
          color={item.saved ? COLORS.text : COLORS.secondary}
        />
      </Pressable>
    </Pressable>
  );
}

function PopularCard({
  item,
  onPressCard,
  onPressSave,
  saveDisabled,
}: {
  item: FestivalListItem;
  onPressCard: () => void;
  onPressSave: () => void;
  saveDisabled?: boolean;
}) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const range = formatDateRange(item.start_date, item.end_date);

  return (
    <Pressable onPress={onPressCard} style={({ pressed }) => [styles.popularCard, pressed && styles.cardPressed]}>
      <View style={styles.popularAccentBar} />
      <View style={styles.popularInner}>
        <Image
          source={uri ? { uri } : FESTIVAL_PLACEHOLDER}
          style={styles.popularThumb}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
        />
        <View style={styles.popularTextCol}>
          <View style={styles.popularTitleRow}>
            <Ionicons name="star" size={14} color="#D97706" style={styles.popularStar} />
            <Text style={styles.popularTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Text style={styles.popularMeta} numberOfLines={1}>
            {item.city || 'България'} · {range}
          </Text>
          <Text style={styles.popularHint} numberOfLines={1}>
            Най-запазвани от общността
          </Text>
        </View>
        <Pressable
          disabled={saveDisabled}
          onPress={onPressSave}
          style={({ pressed }) => [
            styles.compactSave,
            saveDisabled && styles.saveBtnDisabled,
            pressed && !saveDisabled && styles.iconPressed,
          ]}
          hitSlop={10}>
          <Ionicons
            name={item.saved ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={item.saved ? COLORS.text : COLORS.secondary}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.sectionError}>
      <Text style={styles.sectionErrorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.sectionRetry}>
        <Text style={styles.sectionRetryText}>Опитай отново</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const toggleSavedMutation = useToggleSavedMutation();

  const trendingCardWidth = Math.min(360, Math.round(windowWidth * 0.88));

  const trendingQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'trending'],
    queryFn: () => getFestivals({ sort: 'trending', limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const weekQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'week'],
    queryFn: () => getFestivals({ when: 'this_week', limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const popularQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'popular'],
    queryFn: () => getFestivals({ sort: 'popular', limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const trending = trendingQuery.data ?? [];
  const week = weekQuery.data ?? [];
  const popular = popularQuery.data ?? [];

  const showTrending =
    trendingQuery.isError || trending.length > 0 || trendingQuery.isLoading;
  const showTrendingContent = !trendingQuery.isError && trending.length > 0;

  const sections: HomeSection[] = [];
  if (!weekQuery.isLoading && week.length > 0) {
    sections.push({ key: 'week', title: '📅 Тази седмица', data: week });
  }
  if (!popularQuery.isLoading && popular.length > 0) {
    sections.push({ key: 'popular', title: '⭐ Най-запазвани', data: popular });
  }

  const onRefresh = () => {
    trendingQuery.refetch();
    weekQuery.refetch();
    popularQuery.refetch();
  };

  const savePending = toggleSavedMutation.isPending;

  const openFestival = useCallback(
    (item: FestivalListItem) => {
      void queryClient.prefetchQuery({
        queryKey: ['festival', item.slug],
        queryFn: () => getFestivalBySlug(item.slug),
      });
      router.push(`/festival/${item.slug}`);
    },
    [router],
  );

  const onSave = useCallback(
    (item: FestivalListItem) => {
      if (toggleSavedMutation.isPending) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSavedMutation.mutate({
        festivalId: item.festivalId,
        slug: item.slug,
        festival: item,
      });
    },
    [toggleSavedMutation],
  );

  const renderTrendingCard = useCallback(
    ({ item }: ListRenderItemInfo<FestivalListItem>) => (
      <TrendingCard
        item={item}
        width={trendingCardWidth}
        onPressCard={() => openFestival(item)}
        onPressSave={() => onSave(item)}
        saveDisabled={savePending}
      />
    ),
    [trendingCardWidth, onSave, openFestival, savePending],
  );

  const renderSectionItem = useCallback(
    ({ item, section }: SectionListRenderItemInfo<FestivalListItem, HomeSection>) =>
      section.key === 'week' ? (
        <CompactWeekCard
          item={item}
          onPressCard={() => openFestival(item)}
          onPressSave={() => onSave(item)}
          saveDisabled={savePending}
        />
      ) : (
        <PopularCard
          item={item}
          onPressCard={() => openFestival(item)}
          onPressSave={() => onSave(item)}
          saveDisabled={savePending}
        />
      ),
    [onSave, openFestival, savePending],
  );

  const refreshing =
    trendingQuery.isRefetching || weekQuery.isRefetching || popularQuery.isRefetching;

  return (
    <SectionList<HomeSection['data'][number], HomeSection>
      sections={sections}
      keyExtractor={(item) => item.slug}
      stickySectionHeadersEnabled={false}
      nestedScrollEnabled
      extraData={savePending}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 8, paddingBottom: 32 }]}
      renderSectionHeader={({ section }) => (
        <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>{section.title}</Text>
      )}
      SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
      renderItem={renderSectionItem}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <HomeHeader onSearchPress={() => {}} />

          {showTrending ? (
            <View style={styles.trendingSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>🔥 Популярни сега</Text>
              {trendingQuery.isError ? (
                <SectionError message="Не успяхме да заредим секцията." onRetry={() => trendingQuery.refetch()} />
              ) : trendingQuery.isLoading && trending.length === 0 ? (
                <TrendingSkeleton cardWidth={trendingCardWidth} />
              ) : showTrendingContent ? (
                <View style={styles.trendingScrollOuter}>
                  <FlatList
                    data={trending}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.festivalId}
                    renderItem={renderTrendingCard}
                    initialNumToRender={5}
                    windowSize={5}
                    maxToRenderPerBatch={5}
                    contentContainerStyle={styles.trendingFlatListContent}
                    ItemSeparatorComponent={TrendingItemSeparator}
                    extraData={savePending}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {weekQuery.isLoading && week.length === 0 ? (
            <View style={styles.skeletonSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>📅 Тази седмица</Text>
              {[0, 1, 2].map((i) => (
                <WeekSkeletonRow key={i} />
              ))}
            </View>
          ) : weekQuery.isError ? (
            <View style={styles.skeletonSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>📅 Тази седмица</Text>
              <SectionError message="Не успяхме да заредим секцията." onRetry={() => weekQuery.refetch()} />
            </View>
          ) : null}

          {popularQuery.isLoading && popular.length === 0 ? (
            <View style={styles.skeletonSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>⭐ Най-запазвани</Text>
              {[0, 1, 2].map((i) => (
                <PopularSkeletonRow key={i} />
              ))}
            </View>
          ) : popularQuery.isError ? (
            <View style={styles.skeletonSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>⭐ Най-запазвани</Text>
              <SectionError message="Не успяхме да заредим секцията." onRetry={() => popularQuery.refetch()} />
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: festivalUi.screenPadding,
  },
  headerBlock: {
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitles: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 15,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  searchButton: {
    padding: 6,
    borderRadius: 999,
  },
  searchButtonPressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  sectionSep: {
    height: 14,
  },
  trendingSection: {
    marginBottom: 8,
  },
  trendingScrollOuter: {
    marginHorizontal: -festivalUi.screenPadding,
  },
  trendingFlatListContent: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingBottom: 4,
  },
  trendingItemSep: {
    width: 14,
  },
  trendingSkeletonRow: {
    flexDirection: 'row',
    gap: 14,
  },
  trendingCard: {
    height: 248,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  trendingGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  trendingSaveBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  trendingSaveBtnPressed: {
    opacity: 0.85,
  },
  trendingTextBlock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  trendingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  trendingMeta: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
  },
  trendingSkeletonCard: {
    height: 248,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  skeletonSection: {
    marginBottom: 8,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 12,
  },
  compactThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  compactThumbFallback: {
    backgroundColor: '#E5E7EB',
  },
  compactBody: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  compactMeta: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.secondary,
  },
  compactDate: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
  compactSave: {
    padding: 4,
  },
  popularCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  popularAccentBar: {
    height: 4,
    backgroundColor: '#F59E0B',
  },
  popularInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  popularThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  popularTextCol: {
    flex: 1,
    minWidth: 0,
  },
  popularTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  popularStar: {
    marginTop: 3,
  },
  popularTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  popularMeta: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.secondary,
  },
  popularHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  compactSkeletonThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  compactSkeletonBody: {
    flex: 1,
    gap: 8,
  },
  skeletonLineLg: {
    height: 14,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    width: '88%',
  },
  skeletonLineMd: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    width: '55%',
  },
  skeletonLineSm: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    width: '70%',
  },
  popularSkeletonRow: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  popularSkeletonAccent: {
    height: 4,
    backgroundColor: '#FCD34D',
  },
  popularSkeletonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: '#FFFBEB',
  },
  sectionError: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionErrorText: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 8,
  },
  sectionRetry: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.text,
  },
  sectionRetryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cardPressed: {
    opacity: 0.94,
  },
  iconPressed: {
    opacity: 0.65,
  },
});
