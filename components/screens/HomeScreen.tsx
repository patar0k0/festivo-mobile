import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListRenderItemInfo, SectionListRenderItemInfo, StyleProp, ViewStyle } from 'react-native';
import {
    ActivityIndicator,
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

import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton, skeletonRadii, skeletonRhythm } from '@/components/ui/Skeleton';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivalBySlug, getFestivals } from '@/lib/api/festivals';
import { getPersonalizedSections, type PersonalizedSection } from '@/lib/api/recommendations';
import { debugLogRare } from '@/lib/debug/mobileDiagnosticsHelpers';
import { formatDateRangeRelative, getRelativeDateLabel } from '@/lib/festival/relativeDate';
import { getRecentlyViewedFestivals, type RecentlyViewedFestival } from '@/lib/personalization/recentlyViewed';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { queryClient } from '@/lib/queryClient';

const COLORS = festivalUi.colors;

/** Horizontal gap between trending cards; must match `trendingItemSep` for accurate `getItemLayout`. */
const TRENDING_CARD_SEPARATOR_WIDTH = 14;

type SectionKey = 'week' | 'popular' | 'continue';
type SectionVariant = 'continue' | 'week' | 'popular' | 'following';

type HomeSectionBase = {
  /** Feed layout bucket (continue / week / popular). Not a React list key. */
  bucket: SectionKey;
  source:
    | 'recently_viewed'
    | PersonalizedSection['key']
    | 'week'
    | 'popular'
    | 'planner_weekend'
    | 'planner_category'
    | 'planner_city';
  variant: SectionVariant;
  title: string;
  data: FestivalListItem[];
};

/** SectionList row: `key` must be unique per section or RN duplicates sticky/header cells (e.g. '.$week=2header'). */
type HomeSection = HomeSectionBase & { key: string };

const IMAGE_PLACEHOLDER_HASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';
const SECTION_ROTATION_ORDERS: ('continue' | 'week' | 'popular')[][] = [
  ['continue', 'week', 'popular'],
  ['continue', 'popular', 'week'],
  ['week', 'continue', 'popular'],
  ['popular', 'continue', 'week'],
];

function pickSectionTitle(section: HomeSectionBase): string {
  const firstItem = section.data[0];
  const city = firstItem?.city?.trim();
  switch (section.source) {
    case 'recently_viewed':
      return 'Продължи оттук';
    case 'near_you':
      return city ? `Популярно около ${city}` : 'Популярно около теб';
    case 'this_weekend':
      return 'За този уикенд';
    case 'from_followed_organizers':
      return 'Ново от следвани организатори';
    case 'for_you':
      return 'Може да ти хареса';
    case 'trending':
      return 'Набира скорост';
    case 'planner_weekend':
      return 'Продължи планирането за уикенда';
    case 'planner_category':
      return firstItem?.category === 'folk' || firstItem?.category === 'folklore'
        ? 'Защото планираш фолклорни събития'
        : 'Подобни на планираните от теб';
    case 'planner_city':
      return city ? `Често избираш събития в ${city}` : 'По твоите места';
    case 'week':
      return 'Тази седмица';
    case 'popular':
      return 'Най-запазвани';
    default:
      return section.title;
  }
}

function formatViewedAgo(viewedAt?: string): string {
  if (!viewedAt) return 'Наскоро';
  const ms = Date.parse(viewedAt);
  if (!Number.isFinite(ms)) return 'Наскоро';
  const diffMin = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 60) return `Преди ${diffMin} мин`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `Преди ${diffHours} ч`;
  const diffDays = Math.round(diffHours / 24);
  return `Преди ${diffDays} д`;
}

function resolveWeekendHint(dateIso: string): boolean {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

function attachPlannerRecencyHints(
  items: FestivalListItem[],
  savedFestivalIds: string[],
  hasPlannedScheduleItems: boolean,
): FestivalListItem[] {
  const saved = new Set(savedFestivalIds);
  return items.map((item) => {
    if (!saved.has(item.festivalId)) {
      if (!item.planner_recency_hint) return item;
      const { planner_recency_hint: _h, ...rest } = item;
      return rest;
    }
    let planner_recency_hint: string;
    if (resolveWeekendHint(item.start_date)) {
      planner_recency_hint = hasPlannedScheduleItems
        ? 'Планираш уикенда · сесии в програмата'
        : 'Планираш този уикенд';
    } else {
      planner_recency_hint = hasPlannedScheduleItems
        ? 'Продължи програмата си'
        : 'В твоя план';
    }
    if (item.planner_recency_hint === planner_recency_hint) return item;
    return { ...item, planner_recency_hint };
  });
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function TrendingItemSeparator() {
  return <View style={styles.trendingItemSep} />;
}

function TrendingSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View style={[styles.trendingFlatListContent, styles.trendingSkeletonRow]}>
      {[0, 1, 2].map((k) => (
        <Skeleton
          key={k}
          width={cardWidth}
          height={198}
          radius={22}
          style={styles.trendingSkeletonCard}
        />
      ))}
    </View>
  );
}

function WeekSkeletonRow() {
  return (
    <View style={styles.compactSkeletonRow}>
      <Skeleton
        width={skeletonRhythm.thumb}
        height={skeletonRhythm.thumb}
        radius={skeletonRadii.thumb}
      />
      <View style={styles.compactSkeletonBody}>
        <Skeleton height={skeletonRhythm.lineLg} width={'88%'} />
        <Skeleton height={skeletonRhythm.lineSm} width={'70%'} />
        <Skeleton height={skeletonRhythm.lineMd} width={'55%'} />
      </View>
    </View>
  );
}

function PopularSkeletonRow() {
  return (
    <View style={styles.popularSkeletonRow}>
      <View style={styles.popularSkeletonAccent} />
      <View style={styles.popularSkeletonInner}>
        <Skeleton
          width={skeletonRhythm.thumb}
          height={skeletonRhythm.thumb}
          radius={skeletonRadii.thumb}
        />
        <View style={styles.compactSkeletonBody}>
          <Skeleton height={skeletonRhythm.lineLg} width={'88%'} />
          <Skeleton height={skeletonRhythm.lineSm} width={'70%'} />
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
        <AnimatedBookmark filled={filled} size={22} color="#FFFFFF" />
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
    <PressableScale
      onPress={onPressCard}
      pressedScale={0.97}
      pressedOpacity={0.92}
      style={{ width }}>
      <View style={[styles.trendingCardInner, { width }]}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={260}
            cachePolicy="memory-disk"
            priority="high"
            placeholder={IMAGE_PLACEHOLDER_HASH}
            placeholderContentFit="cover"
          />
        ) : (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['#F87171', '#E85D5D', '#9B1C1C']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.imageFallbackEmojiWrap} pointerEvents="none">
              <Text style={styles.imageFallbackEmoji}>🎉</Text>
            </View>
          </>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.52)']}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.trendingTextOverlay}>
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
    </PressableScale>
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
    <PressableScale
      onPress={onPressCard}
      pressedScale={0.985}
      pressedOpacity={0.9}
      style={styles.compactCard}>
      <View style={styles.compactThumb}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            priority="normal"
            placeholder={IMAGE_PLACEHOLDER_HASH}
            placeholderContentFit="cover"
          />
        ) : (
          <LinearGradient
            pointerEvents="none"
            colors={['#E85D5D', '#B91C1C']}
            style={StyleSheet.absoluteFill}>
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
        {item.planner_recency_hint ? (
          <Text style={styles.plannerRecencyHint} numberOfLines={1}>
            {item.planner_recency_hint}
          </Text>
        ) : null}
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
          <AnimatedBookmark filled={item.saved} size={22} color={bookmarkColor} />
        )}
      </Pressable>
    </PressableScale>
  );
}

function ContinueCard({
  item,
  title,
  onPressCard,
  onPressSave,
  saveDisabled,
}: {
  item: RecentlyViewedFestival;
  title: string;
  onPressCard: () => void;
  onPressSave: () => void;
  saveDisabled?: boolean;
}) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const range = formatDateRangeRelative(item.start_date, item.end_date);
  const isSaving = Boolean(saveDisabled);
  return (
    <PressableScale onPress={onPressCard} pressedScale={0.985} pressedOpacity={0.92} style={styles.continueCard}>
      <View style={styles.continueThumb}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={240}
            cachePolicy="memory-disk"
            priority="normal"
            placeholder={IMAGE_PLACEHOLDER_HASH}
            placeholderContentFit="cover"
          />
        ) : (
          <LinearGradient pointerEvents="none" colors={['#E85D5D', '#B91C1C']} style={StyleSheet.absoluteFill}>
            <Text style={styles.thumbFallbackEmojiSm}>🎉</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.continueBody}>
        <Text style={styles.continueHint}>{title}</Text>
        <Text style={styles.continueTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.continueMeta} numberOfLines={1}>
          {(item.city || 'България') + ' · ' + range}
        </Text>
        <Text style={styles.continueViewedAt} numberOfLines={1}>
          {formatViewedAgo(item.viewed_at)}
        </Text>
        <View style={styles.continueProgressChip}>
          <Ionicons name="play-forward-outline" size={10} color="#4F46E5" />
          <Text style={styles.continueProgressText}>Продължи</Text>
        </View>
      </View>
      <Pressable
        disabled={saveDisabled}
        onPress={onPressSave}
        style={({ pressed }) => [
          styles.continueSave,
          saveDisabled && styles.saveBtnDisabled,
          isSaving && styles.listSaveSaving,
          pressed && !saveDisabled && styles.iconPressed,
        ]}
        hitSlop={10}>
        {isSaving ? (
          <ActivityIndicator size="small" color={COLORS.text} />
        ) : (
          <AnimatedBookmark filled={item.saved} size={20} color={item.saved ? COLORS.text : COLORS.secondary} />
        )}
      </Pressable>
    </PressableScale>
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
    <PressableScale
      onPress={onPressCard}
      pressedScale={0.985}
      pressedOpacity={0.92}
      style={styles.popularCard}>
      <View style={styles.popularAccentBar} />
      <View style={styles.popularInner}>
        <View style={styles.popularThumb}>
          {uri ? (
            <ExpoImage
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={210}
              cachePolicy="memory-disk"
              priority="normal"
              placeholder={IMAGE_PLACEHOLDER_HASH}
              placeholderContentFit="cover"
            />
          ) : (
            <LinearGradient
              pointerEvents="none"
              colors={['#E85D5D', '#B91C1C']}
              style={StyleSheet.absoluteFill}>
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
          {item.planner_recency_hint ? (
            <Text style={styles.plannerRecencyHintPopular} numberOfLines={1}>
              {item.planner_recency_hint}
            </Text>
          ) : null}
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
            <AnimatedBookmark filled={item.saved} size={22} color={bookmarkColor} />
          )}
        </Pressable>
      </View>
    </PressableScale>
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
  const planQuery = useMobilePlanState();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const CARD_WIDTH = Math.min(360, Math.round(windowWidth * 0.88));

  const trendingQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'trending'],
    queryFn: () => getFestivals({ sort: 'trending', limit: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const weekQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'week'],
    queryFn: () => getFestivals({ when: 'this_week', limit: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const popularQuery = useQuery<FestivalListItem[], Error, FestivalListItem[]>({
    queryKey: ['festivals', 'popular'],
    queryFn: () => getFestivals({ sort: 'popular', limit: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
  const personalizedQuery = useQuery({
    queryKey: ['feed', 'personalized'],
    queryFn: () => getPersonalizedSections(1),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
  const recentlyViewedQuery = useQuery({
    queryKey: ['recently-viewed'],
    queryFn: () => getRecentlyViewedFestivals(8),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 15,
  });

  const trending = useMemo(() => trendingQuery.data ?? [], [trendingQuery.data]);
  const week = useMemo(() => weekQuery.data ?? [], [weekQuery.data]);
  const popular = useMemo(() => popularQuery.data ?? [], [popularQuery.data]);
  const personalizedSections = useMemo(
    () => personalizedQuery.data ?? [],
    [personalizedQuery.data],
  );
  const recommendationPool = useMemo(() => {
    const seen = new Set<string>();
    const out: FestivalListItem[] = [];
    const push = (items: FestivalListItem[]) => {
      for (const item of items) {
        if (seen.has(item.festivalId)) continue;
        seen.add(item.festivalId);
        out.push(item);
      }
    };
    push(personalizedSections.flatMap((section) => section.items));
    push(week);
    push(popular);
    push(trending);
    return out;
  }, [personalizedSections, popular, trending, week]);

  const plannerAwareSections = useMemo<HomeSectionBase[]>(() => {
    const plannedIds = new Set(planQuery.savedFestivalIds);
    if (!plannedIds.size) return [];
    const plannedVisible = recommendationPool.filter((item) => plannedIds.has(item.festivalId));
    const candidates = recommendationPool.filter((item) => !plannedIds.has(item.festivalId));
    const sectionsOut: HomeSectionBase[] = [];

    const plannedWeekend = plannedVisible.filter((item) => resolveWeekendHint(item.start_date));
    const weekendCandidates = candidates.filter((item) => resolveWeekendHint(item.start_date)).slice(0, 4);
    if (plannedWeekend.length > 0 && weekendCandidates.length > 0) {
      sectionsOut.push({
        bucket: 'week',
        source: 'planner_weekend',
        variant: 'week',
        title: 'Продължи планирането за уикенда',
        data: weekendCandidates,
      });
    }

    const category = mostCommon(plannedVisible.map((item) => item.category).filter(Boolean) as string[]);
    if (category) {
      const categoryCandidates = candidates.filter((item) => item.category === category).slice(0, 4);
      if (categoryCandidates.length > 0) {
        sectionsOut.push({
          bucket: 'week',
          source: 'planner_category',
          variant: 'week',
          title: 'Подобни на планираните от теб',
          data: categoryCandidates,
        });
      }
    }

    const city = mostCommon(plannedVisible.map((item) => item.city).filter(Boolean));
    if (city) {
      const cityCandidates = candidates.filter((item) => item.city === city).slice(0, 4);
      if (cityCandidates.length > 0) {
        sectionsOut.push({
          bucket: 'popular',
          source: 'planner_city',
          variant: 'popular',
          title: `Често избираш събития в ${city}`,
          data: cityCandidates,
        });
      }
    }

    return sectionsOut.slice(0, 2);
  }, [planQuery.savedFestivalIds, recommendationPool]);
  const plannerAwareSectionSummary = useMemo(
    () => plannerAwareSections.map((section) => `${section.source}:${section.data.length}`).join('|'),
    [plannerAwareSections],
  );

  useEffect(() => {
    if (!plannerAwareSections.length) return;
    debugLogRare(`planner_section_promote:${plannerAwareSectionSummary}`, {
      type: 'planner_section_promote',
      scope: 'recommendations',
      message: 'Planner-aware home sections promoted.',
      meta: {
        promotedSectionCount: plannerAwareSections.length,
        promotedSources: plannerAwareSections.map((section) => section.source),
        sectionCounts: plannerAwareSections.map((section) => section.data.length),
        stalePlannerAgeMs: planQuery.dataUpdatedAt ? Date.now() - planQuery.dataUpdatedAt : undefined,
      },
    });
  }, [plannerAwareSectionSummary, plannerAwareSections, planQuery.dataUpdatedAt]);

  const trendingIds = new Set(trending.map((i) => i.festivalId));

  const weekFilteredRaw = week.filter((i) => !trendingIds.has(i.festivalId));

  // Smarter fallback — avoids full duplication vs trending; caps fallback list size.
  const MIN_ITEMS = 3;

  const weekFiltered =
    weekFilteredRaw.length >= MIN_ITEMS ? weekFilteredRaw : week.slice(0, MIN_ITEMS);

  const showTrending =
    trendingQuery.isError || trending.length > 0 || trendingQuery.isLoading;
  const showTrendingContent = !trendingQuery.isError && trending.length > 0;

  const continueExploring = useMemo(
    () => (recentlyViewedQuery.data ?? []).slice(0, 6),
    [recentlyViewedQuery.data],
  );
  const hasFollowedItems = useMemo(
    () => personalizedSections.some((section) => section.key === 'from_followed_organizers'),
    [personalizedSections],
  );
  const trendingTitle = hasFollowedItems ? 'В тренд за теб' : 'Популярни сега';
  const weekFallbackTitle = personalizedSections.some((section) => section.key === 'this_weekend')
    ? 'За този уикенд'
    : 'Тази седмица';
  const popularFallbackTitle = personalizedSections.some((section) => section.key === 'near_you')
    ? 'Популярно около теб'
    : 'Най-запазвани';

  const rotationSeedRef = useRef<number | null>(null);
  if (rotationSeedRef.current == null) {
    const daySeed = new Date().getDate();
    const followsSeed = hasFollowedItems ? 1 : 0;
    const viewedSeed = Math.min(continueExploring.length, 3);
    rotationSeedRef.current = (daySeed + followsSeed + viewedSeed) % SECTION_ROTATION_ORDERS.length;
  }
  const sessionOrder = SECTION_ROTATION_ORDERS[rotationSeedRef.current];

  const sections = useMemo(() => {
    const grouped: Record<'continue' | 'week' | 'popular', HomeSectionBase[]> = {
      continue: [],
      week: [],
      popular: [],
    };

    if (continueExploring.length > 0) {
      grouped.continue.push({
        bucket: 'continue',
        source: 'recently_viewed',
        variant: 'continue',
        title: 'Продължи оттук',
        data: continueExploring,
      });
    }

    for (const section of personalizedSections) {
      const bucket: SectionKey = section.key === 'trending' ? 'popular' : 'week';
      const variant: SectionVariant = section.key === 'from_followed_organizers' ? 'following' : bucket;
      grouped[bucket].push({
        bucket,
        source: section.key,
        variant,
        title: section.title,
        data: section.items,
      });
    }

    for (const section of [...plannerAwareSections].reverse()) {
      grouped[section.bucket === 'popular' ? 'popular' : 'week'].unshift(section);
    }

    if (!weekQuery.isLoading && weekFiltered.length > 0) {
      grouped.week.push({
        bucket: 'week',
        source: 'week',
        variant: 'week',
        title: 'Тази седмица',
        data: weekFiltered,
      });
    }
    if (!popularQuery.isLoading && popular.length > 0) {
      grouped.popular.push({
        bucket: 'popular',
        source: 'popular',
        variant: 'popular',
        title: 'Най-запазвани',
        data: popular,
      });
    }

    const ordered = sessionOrder.flatMap((bucket) => grouped[bucket]);
    const hasProgram = planQuery.savedScheduleItemIds.length > 0;
    const sourceOccurrence = new Map<string, number>();
    return ordered.map((section) => {
      const data =
        section.variant === 'continue'
          ? section.data
          : attachPlannerRecencyHints(
              section.data as FestivalListItem[],
              planQuery.savedFestivalIds,
              hasProgram,
            );
      const src = section.source;
      const n = (sourceOccurrence.get(src) ?? 0) + 1;
      sourceOccurrence.set(src, n);
      return {
        ...section,
        key: `${src}:${n}`,
        data: data as HomeSection['data'],
        title: pickSectionTitle(section),
      };
    });
  }, [
    continueExploring,
    personalizedSections,
    plannerAwareSections,
    planQuery.savedFestivalIds,
    planQuery.savedScheduleItemIds,
    popular,
    popularQuery.isLoading,
    sessionOrder,
    weekFiltered,
    weekQuery.isLoading,
  ]);
  const plannerHintCount = useMemo(
    () =>
      sections.reduce(
        (count, section) => count + section.data.filter((item) => Boolean(item.planner_recency_hint)).length,
        0,
      ),
    [sections],
  );

  useEffect(() => {
    if (!__DEV__ || plannerHintCount <= 0) return;
    debugLogRare(`planner_hint_apply:${plannerHintCount}:${sections.length}`, {
      type: 'planner_hint_apply',
      scope: 'recommendations',
      message: 'Planner recency hints applied to home feed items.',
      meta: {
        hintCount: plannerHintCount,
        sectionCount: sections.length,
        savedFestivalCount: planQuery.savedFestivalIds.length,
        stalePlannerAgeMs: planQuery.dataUpdatedAt ? Date.now() - planQuery.dataUpdatedAt : undefined,
      },
    });
  }, [plannerHintCount, sections.length, planQuery.savedFestivalIds.length, planQuery.dataUpdatedAt]);

  const refetchAll = useCallback(() => {
    void trendingQuery.refetch();
    void weekQuery.refetch();
    void popularQuery.refetch();
    void personalizedQuery.refetch();
    void recentlyViewedQuery.refetch();
    void planQuery.refetch();
  }, [trendingQuery, weekQuery, popularQuery, personalizedQuery, recentlyViewedQuery, planQuery]);

  const openFestival = useCallback(
    (item: FestivalListItem) => {
      if (__DEV__) {
        console.log('[festivo] home open festival', { slug: item.slug, festivalId: item.festivalId });
      }
      const existing = queryClient.getQueryData(['festival', item.slug]);
      if (!existing) {
        void queryClient.prefetchQuery({
          queryKey: ['festival', item.slug],
          queryFn: () => getFestivalBySlug(item.slug),
          staleTime: 1000 * 60 * 5,
          gcTime: 1000 * 60 * 30,
        });
      }
      router.push(`/festival/${item.slug}`);
    },
    [router],
  );

  const onSave = useCallback(
    (item: FestivalListItem) => {
      if (__DEV__) {
        console.log('[festivo] home save toggle', { slug: item.slug, festivalId: item.festivalId });
      }
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
    ({ item, index, section }: SectionListRenderItemInfo<FestivalListItem, HomeSection>) =>
      section.variant === 'continue' ? (
        index === 0 ? (
          <View style={styles.continueCarouselWrap}>
            <FlatList
              data={section.data as RecentlyViewedFestival[]}
              horizontal
              keyExtractor={(continueItem) => continueItem.festivalId}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.continueCarouselContent}
              ItemSeparatorComponent={() => <View style={styles.continueCarouselSep} />}
              renderItem={({ item: continueItem }) => (
                <ContinueCard
                  item={continueItem}
                  title={section.title}
                  onPressCard={() => openFestival(continueItem)}
                  onPressSave={() => onSave(continueItem)}
                  saveDisabled={pendingIds.has(continueItem.festivalId)}
                />
              )}
              initialNumToRender={4}
              windowSize={5}
              maxToRenderPerBatch={4}
            />
          </View>
        ) : null
      ) : section.variant === 'week' || section.variant === 'following' ? (
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
    trendingQuery.isRefetching ||
    weekQuery.isRefetching ||
    popularQuery.isRefetching ||
    personalizedQuery.isRefetching ||
    recentlyViewedQuery.isRefetching;

  const weekHeaderBlockInListHeader =
    (weekQuery.isLoading && week.length === 0) || weekQuery.isError;

  /** RN lists can skip cell updates if only nested fields change; `dataUpdatedAt` bumps on every cache patch. */
  const listExtrasKey = `${trendingQuery.dataUpdatedAt}|${weekQuery.dataUpdatedAt}|${popularQuery.dataUpdatedAt}|${planQuery.dataUpdatedAt}|${[...pendingIds].sort().join(',')}`;
  const renderSectionHeader = useCallback(({ section }: { section: HomeSection }) => {
    const toneStyle =
      section.variant === 'popular'
        ? styles.sectionHeaderPopular
        : section.variant === 'following'
          ? styles.sectionHeaderFollowing
          : section.variant === 'continue'
            ? styles.sectionHeaderContinue
            : styles.sectionHeaderWeek;
    const badgeLabel =
      section.source === 'near_you'
        ? 'Наблизо'
        : section.source === 'planner_weekend' ||
            section.source === 'planner_category' ||
            section.source === 'planner_city'
          ? 'По плана'
        : section.source === 'from_followed_organizers'
          ? 'Следвани'
          : section.source === 'for_you'
            ? 'Персонално'
            : section.source === 'this_weekend'
              ? 'Уикенд'
              : section.source === 'trending'
                ? 'В тренд'
                : undefined;

    return (
      <View style={[styles.sectionHeaderWrap, toneStyle]}>
        <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>{section.title}</Text>
        {badgeLabel ? (
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>
    );
  }, []);

  return (
    <SectionList<HomeSection['data'][number], HomeSection>
      sections={sections}
      keyExtractor={(item) => item.slug}
      stickySectionHeadersEnabled={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      extraData={listExtrasKey}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refetchAll}
          progressViewOffset={Math.max(insets.top + 48, 80)}
          tintColor={COLORS.text}
          colors={[COLORS.text]}
        />
      }
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 },
      ]}
      renderSectionHeader={renderSectionHeader}
      SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
      renderItem={renderSectionItem}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <HomeHeader onSearchPress={() => router.push('/search')} />

          {showTrending ? (
            <View style={styles.trendingSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>🔥 {trendingTitle}</Text>
              {trendingQuery.isError ? (
                <SectionError message="Не успяхме да заредим секцията." onRetry={() => trendingQuery.refetch()} />
              ) : trendingQuery.isLoading && trending.length === 0 ? (
                <TrendingSkeleton cardWidth={CARD_WIDTH} />
              ) : showTrendingContent ? (
                <View style={styles.trendingScrollOuter} pointerEvents="box-none">
                  <FlatList
                    data={trending}
                    horizontal
                    keyboardShouldPersistTaps="handled"
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
                    extraData={listExtrasKey}
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
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>📅 {weekFallbackTitle}</Text>
              {[0, 1, 2].map((i) => (
                <WeekSkeletonRow key={i} />
              ))}
            </View>
          ) : weekQuery.isError ? (
            <View style={styles.skeletonSection}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>📅 {weekFallbackTitle}</Text>
              <SectionError message="Не успяхме да заредим секцията." onRetry={() => weekQuery.refetch()} />
            </View>
          ) : null}

          {popularQuery.isLoading && popular.length === 0 ? (
            <View
              style={[
                styles.skeletonSection,
                weekHeaderBlockInListHeader ? styles.skeletonSectionAfter : null,
              ]}>
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>⭐ {popularFallbackTitle}</Text>
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
              <Text style={[festivalUi.typography.sectionTitle, styles.sectionTitle]}>⭐ {popularFallbackTitle}</Text>
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
    marginBottom: 8,
  },
  sectionSep: {
    height: 24,
  },
  sectionHeaderWrap: {
    marginBottom: 8,
  },
  sectionHeaderWeek: {
    paddingLeft: 2,
  },
  sectionHeaderPopular: {
    paddingLeft: 2,
  },
  sectionHeaderFollowing: {
    paddingLeft: 2,
  },
  sectionHeaderContinue: {
    paddingLeft: 2,
  },
  sectionBadge: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  sectionBadgeText: {
    fontSize: 11,
    color: '#3730A3',
    fontWeight: '600',
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
    gap: 12,
  },
  trendingCardInner: {
    height: 198,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  trendingSaveBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  trendingBookmarkPosition: {
    position: 'absolute',
    top: 9,
    right: 9,
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
    maxWidth: '78%',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  trendingMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
  },
  trendingSkeletonCard: {
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
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
    fontWeight: '500',
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
  plannerRecencyHint: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.1,
  },
  plannerRecencyHintPopular: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '800',
    color: '#4338CA',
    letterSpacing: 0.1,
  },
  compactSave: {
    padding: 4,
  },
  popularCard: {
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  popularAccentBar: {
    height: 2,
    backgroundColor: 'rgba(245,158,11,0.4)',
  },
  popularInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: '#FFFBEB',
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
    fontWeight: '600',
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
    fontWeight: '500',
    color: '#A16207',
  },
  continueCarouselWrap: {
    marginHorizontal: -festivalUi.screenPadding,
  },
  continueCarouselContent: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingBottom: 2,
  },
  continueCarouselSep: {
    width: 10,
  },
  continueCard: {
    width: 288,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 10,
  },
  continueThumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  continueBody: {
    flex: 1,
    minWidth: 0,
  },
  continueHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 3,
  },
  continueTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  continueMeta: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.secondary,
  },
  continueViewedAt: {
    marginTop: 3,
    fontSize: 11,
    color: COLORS.muted,
  },
  continueProgressChip: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#EEF2FF',
  },
  continueProgressText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  continueSave: {
    padding: 4,
  },
  compactSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  compactSkeletonBody: {
    flex: 1,
    gap: 8,
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
