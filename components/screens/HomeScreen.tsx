import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListRenderItemInfo, SectionListRenderItemInfo, StyleProp, ViewStyle } from 'react-native';
import {
    ActivityIndicator,
    Animated,
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

import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivalBySlug, getFestivals } from '@/lib/api/festivals';
import { formatDateRangeRelative, getRelativeDateLabel } from '@/lib/festival/relativeDate';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { queryClient } from '@/lib/queryClient';

const COLORS = festivalUi.colors;

/** Horizontal gap between trending cards; must match `trendingItemSep` for accurate `getItemLayout`. */
const TRENDING_CARD_SEPARATOR_WIDTH = 14;

type SectionKey = 'week' | 'popular';

type HomeSection = {
  key: SectionKey;
  title: string;
  data: FestivalListItem[];
};

function TrendingItemSeparator() {
  return <View style={styles.trendingItemSep} />;
}

function TrendingSkeletonPulse({ cardWidth }: { cardWidth: number }) {
  const opacity = useRef(new Animated.Value(0.42)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.95, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.42, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[styles.trendingSkeletonCard, { width: cardWidth, opacity }]}
    />
  );
}

function TrendingSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View style={[styles.trendingFlatListContent, styles.trendingSkeletonRow]}>
      {[0, 1, 2].map((k) => (
        <TrendingSkeletonPulse key={k} cardWidth={cardWidth} />
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

function BookmarkButton({
  filled,
  disabled,
  isSaving,
  onPress,
  style,
}: {
  filled: boolean;
  disabled?: boolean;
  isSaving?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.trendingSaveBtn,
        disabled && !isSaving && styles.saveBtnDisabled,
        isSaving && styles.trendingSaveBtnSaving,
        pressed && !disabled && styles.trendingSaveBtnPressed,
        style,
      ]}
      hitSlop={8}>
      {isSaving ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={filled ? 'bookmark' : 'bookmark-outline'} size={22} color="#FFFFFF" />
      )}
    </Pressable>
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
  const dateLabel = getRelativeDateLabel(item.start_date);
  const cityLine = `${item.city || 'България'} · ${dateLabel}`;
  const isSaving = Boolean(saveDisabled);

  return (
    <Pressable
      onPress={onPressCard}
      style={({ pressed }) => [
        { width },
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}>
      <View style={[styles.trendingCardInner, { width }]}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            priority="high"
          />
        ) : (
          <>
            <LinearGradient colors={['#F87171', '#E85D5D', '#9B1C1C']} style={StyleSheet.absoluteFill} />
            <View style={styles.imageFallbackEmojiWrap} pointerEvents="none">
              <Text style={styles.imageFallbackEmoji}>🎉</Text>
            </View>
          </>
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.52)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.trendingTextOverlay}>
          <Text style={styles.trendingTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.trendingMeta} numberOfLines={1}>
            {cityLine}
          </Text>
        </View>
        <BookmarkButton
          filled={item.saved}
          disabled={saveDisabled}
          isSaving={isSaving}
          onPress={onPressSave}
          style={styles.trendingBookmarkPosition}
        />
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
  const range = formatDateRangeRelative(item.start_date, item.end_date);
  const isSaving = Boolean(saveDisabled);
  const bookmarkColor = item.saved ? COLORS.text : COLORS.secondary;

  return (
    <Pressable
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.compactCard,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}>
      <View style={styles.compactThumb}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            priority="high"
          />
        ) : (
          <LinearGradient colors={['#E85D5D', '#B91C1C']} style={StyleSheet.absoluteFill}>
            <Text style={styles.thumbFallbackEmoji}>🎉</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.compactBody}>
        <Text style={styles.compactTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.compactCity} numberOfLines={1}>
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
          isSaving && styles.listSaveSaving,
          pressed && !saveDisabled && styles.iconPressed,
        ]}
        hitSlop={10}>
        {isSaving ? (
          <ActivityIndicator size="small" color={bookmarkColor} />
        ) : (
          <Ionicons
            name={item.saved ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={bookmarkColor}
          />
        )}
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
  const range = formatDateRangeRelative(item.start_date, item.end_date);
  const isSaving = Boolean(saveDisabled);
  const bookmarkColor = item.saved ? COLORS.text : COLORS.secondary;

  return (
    <Pressable
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.popularCard,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}>
      <View style={styles.popularAccentBar} />
      <View style={styles.popularInner}>
        <View style={styles.popularThumb}>
          {uri ? (
            <ExpoImage
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={120}
              cachePolicy="memory-disk"
              priority="high"
            />
          ) : (
            <LinearGradient colors={['#E85D5D', '#B91C1C']} style={StyleSheet.absoluteFill}>
              <Text style={styles.thumbFallbackEmojiSm}>🎉</Text>
            </LinearGradient>
          )}
        </View>
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
            isSaving && styles.listSaveSaving,
            pressed && !saveDisabled && styles.iconPressed,
          ]}
          hitSlop={10}>
          {isSaving ? (
            <ActivityIndicator size="small" color={bookmarkColor} />
          ) : (
            <Ionicons
              name={item.saved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={bookmarkColor}
            />
          )}
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
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const CARD_WIDTH = Math.min(360, Math.round(windowWidth * 0.88));

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

  const trendingIds = new Set(trending.map((i) => i.festivalId));

  const weekFilteredRaw = week.filter((i) => !trendingIds.has(i.festivalId));

  // Smarter fallback — avoids full duplication vs trending; caps fallback list size.
  const MIN_ITEMS = 3;

  const weekFiltered =
    weekFilteredRaw.length >= MIN_ITEMS ? weekFilteredRaw : week.slice(0, MIN_ITEMS);

  const showTrending =
    trendingQuery.isError || trending.length > 0 || trendingQuery.isLoading;
  const showTrendingContent = !trendingQuery.isError && trending.length > 0;

  const sections: HomeSection[] = [];
  if (!weekQuery.isLoading && weekFiltered.length > 0) {
    sections.push({ key: 'week', title: '📅 Тази седмица', data: weekFiltered });
  }
  if (!popularQuery.isLoading && popular.length > 0) {
    sections.push({ key: 'popular', title: '⭐ Най-запазвани', data: popular });
  }

  const refetchAll = useCallback(() => {
    void trendingQuery.refetch();
    void weekQuery.refetch();
    void popularQuery.refetch();
  }, [trendingQuery, weekQuery, popularQuery]);

  const openFestival = useCallback(
    (item: FestivalListItem) => {
      void queryClient.prefetchQuery({
        queryKey: ['festival', item.slug],
        queryFn: () => getFestivalBySlug(item.slug),
        staleTime: 1000 * 60 * 5,
      });
      router.push(`/festival/${item.slug}`);
    },
    [router],
  );

  const onSave = useCallback(
    (item: FestivalListItem) => {
      const id = item.festivalId;
      setPendingIds((prev) => new Set(prev).add(id));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSavedMutation.mutate(
        {
          festivalId: item.festivalId,
          slug: item.slug,
          festival: item,
        },
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
    },
    [toggleSavedMutation],
  );

  const renderTrendingCard = useCallback(
    ({ item }: ListRenderItemInfo<FestivalListItem>) => (
      <TrendingCard
        item={item}
        width={CARD_WIDTH}
        onPressCard={() => openFestival(item)}
        onPressSave={() => onSave(item)}
        saveDisabled={pendingIds.has(item.festivalId)}
      />
    ),
    [CARD_WIDTH, onSave, openFestival, pendingIds],
  );

  const renderSectionItem = useCallback(
    ({ item, section }: SectionListRenderItemInfo<FestivalListItem, HomeSection>) =>
      section.key === 'week' ? (
        <CompactWeekCard
          item={item}
          onPressCard={() => openFestival(item)}
          onPressSave={() => onSave(item)}
          saveDisabled={pendingIds.has(item.festivalId)}
        />
      ) : (
        <PopularCard
          item={item}
          onPressCard={() => openFestival(item)}
          onPressSave={() => onSave(item)}
          saveDisabled={pendingIds.has(item.festivalId)}
        />
      ),
    [onSave, openFestival, pendingIds],
  );

  const refreshing =
    trendingQuery.isRefetching || weekQuery.isRefetching || popularQuery.isRefetching;

  const weekHeaderBlockInListHeader =
    (weekQuery.isLoading && week.length === 0) || weekQuery.isError;

  return (
    <SectionList<HomeSection['data'][number], HomeSection>
      sections={sections}
      keyExtractor={(item) => item.slug}
      stickySectionHeadersEnabled={false}
      nestedScrollEnabled
      extraData={pendingIds}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refetchAll}
          progressViewOffset={Math.max(insets.top + 48, 80)}
          tintColor={COLORS.text}
          colors={[COLORS.text]}
        />
      }
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 8, paddingBottom: 32 }]}
      renderSectionHeader={({ section }) => (
        <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>{section.title}</Text>
      )}
      SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
      renderItem={renderSectionItem}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <HomeHeader onSearchPress={() => router.push('/search')} />

          {showTrending ? (
            <View style={styles.trendingSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>🔥 Популярни сега</Text>
              {trendingQuery.isError ? (
                <SectionError message="Не успяхме да заредим секцията." onRetry={() => trendingQuery.refetch()} />
              ) : trendingQuery.isLoading && trending.length === 0 ? (
                <TrendingSkeleton cardWidth={CARD_WIDTH} />
              ) : showTrendingContent ? (
                <View style={styles.trendingScrollOuter}>
                  <FlatList
                    data={trending}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={CARD_WIDTH + TRENDING_CARD_SEPARATOR_WIDTH}
                    snapToAlignment="start"
                    keyExtractor={(item) => item.festivalId}
                    renderItem={renderTrendingCard}
                    initialNumToRender={5}
                    windowSize={5}
                    maxToRenderPerBatch={5}
                    contentContainerStyle={styles.trendingFlatListContent}
                    ItemSeparatorComponent={TrendingItemSeparator}
                    extraData={pendingIds}
                    getItemLayout={(_data, index) => ({
                      length: CARD_WIDTH,
                      offset: (CARD_WIDTH + TRENDING_CARD_SEPARATOR_WIDTH) * index,
                      index,
                    })}
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
            <View
              style={[
                styles.skeletonSection,
                weekHeaderBlockInListHeader ? styles.skeletonSectionAfter : null,
              ]}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>⭐ Най-запазвани</Text>
              {[0, 1, 2].map((i) => (
                <PopularSkeletonRow key={i} />
              ))}
            </View>
          ) : popularQuery.isError ? (
            <View
              style={[
                styles.skeletonSection,
                weekHeaderBlockInListHeader ? styles.skeletonSectionAfter : null,
              ]}>
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
    marginBottom: 0,
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
    marginBottom: 14,
  },
  sectionSep: {
    height: 28,
  },
  trendingSection: {
    marginBottom: 22,
  },
  trendingScrollOuter: {
    marginHorizontal: -festivalUi.screenPadding,
  },
  trendingFlatListContent: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingBottom: 4,
  },
  trendingItemSep: {
    width: TRENDING_CARD_SEPARATOR_WIDTH,
  },
  trendingSkeletonRow: {
    flexDirection: 'row',
    gap: 14,
  },
  trendingCardInner: {
    height: 198,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  trendingSaveBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  trendingBookmarkPosition: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  trendingSaveBtnPressed: {
    opacity: 0.85,
  },
  trendingSaveBtnSaving: {
    opacity: 0.72,
  },
  listSaveSaving: {
    opacity: 0.55,
  },
  trendingTextOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  trendingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  trendingMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
  },
  trendingSkeletonCard: {
    height: 198,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  skeletonSection: {
    marginBottom: 8,
  },
  skeletonSectionAfter: {
    marginTop: 28,
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
    overflow: 'hidden',
  },
  imageFallbackEmojiWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackEmoji: {
    fontSize: 52,
  },
  thumbFallbackEmoji: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 72,
  },
  thumbFallbackEmojiSm: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 64,
  },
  compactBody: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  compactCity: {
    marginTop: 6,
    fontSize: 13,
    color: '#666666',
  },
  compactDate: {
    marginTop: 4,
    fontSize: 13,
    color: '#666666',
    fontWeight: '400',
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
    overflow: 'hidden',
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
    marginTop: 6,
    fontSize: 13,
    color: '#666666',
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
  iconPressed: {
    opacity: 0.65,
  },
});
