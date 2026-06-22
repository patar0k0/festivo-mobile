import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveFilterChips } from '@/components/search/ActiveFilterChips';
import { RecentSearches } from '@/components/search/RecentSearches';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchFilterSheet } from '@/components/search/SearchFilterSheet';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { festivalUi } from '@/components/ui/FestivalCard';
import { PressableScale } from '@/components/ui/PressableScale';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivalBySlug, getFestivals } from '@/lib/api/festivals';
import { searchFestivals, hasActiveFilters, type SearchFilters, type SearchWhenPreset } from '@/lib/api/search';
import { getDiscoveryMeta, type DiscoveryPlace } from '@/lib/api/discovery';
import { groupSearchResultsByDate, type GroupedSearchSection } from '@/lib/search/groupSearchResults';
import { addRecentSearch, getRecentSearches } from '@/lib/search/recentSearches';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { queryClient } from '@/lib/queryClient';
import { trackEvent } from '@/lib/analytics/track';
import { getRelativeDateLabel } from '@/lib/festival/relativeDate';

const COLORS = festivalUi.colors;
const EMPTY_FILTERS: SearchFilters = {};

// Chips visible per row when collapsed (2 rows shown)
const CHIPS_PER_ROW = 4;


function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── When options ────────────────────────────────────────────────────────────
type WhenOption = { value: SearchWhenPreset; label: string };
const WHEN_OPTIONS: WhenOption[] = [
  { value: 'today',      label: 'Днес' },
  { value: 'tomorrow',   label: 'Утре' },
  { value: 'weekend',    label: 'Този уикенд' },
  { value: 'this_week',  label: 'Тази седмица' },
  { value: 'this_month', label: 'Този месец' },
];

// ─── Skeleton ────────────────────────────────────────────────────────────────
function ResultSkeletonRow() {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.92, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={[styles.skeletonRow, { opacity }]}>
      <View style={styles.skeletonThumb} />
      <View style={styles.skeletonBody}>
        <View style={styles.skeletonLineLg} />
        <View style={styles.skeletonLineSm} />
        <View style={styles.skeletonLineMd} />
      </View>
      <View style={styles.skeletonSave} />
    </Animated.View>
  );
}
function SearchResultsSkeleton() {
  return (
    <View style={styles.skeletonBlock}>
      {[0, 1, 2, 3, 4, 5].map((k) => <ResultSkeletonRow key={k} />)}
    </View>
  );
}

// ─── Discovery "Тази седмица" mini card ──────────────────────────────────────
function ThisWeekMiniCard({ item, onPress }: { item: FestivalListItem; onPress: () => void }) {
  const uri = item.image_url?.trim() || null;
  const dateLabel = getRelativeDateLabel(item.start_date);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.miniCard, pressed && styles.miniCardPressed]}>
      <View style={styles.miniThumb}>
        {uri ? (
          <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.miniThumbFallback]}>
            <Text style={styles.miniThumbEmoji}>🎉</Text>
          </View>
        )}
      </View>
      <View style={styles.miniBody}>
        <Text style={styles.miniTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.miniMeta} numberOfLines={1}>{item.city?.trim() || 'България'} · {dateLabel}</Text>
      </View>
    </Pressable>
  );
}

// ─── All Places sheet ─────────────────────────────────────────────────────────
function AllPlacesSheet({
  visible,
  places,
  onSelect,
  onClose,
}: {
  visible: boolean;
  places: DiscoveryPlace[];
  onSelect: (place: DiscoveryPlace) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(600);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 260, useNativeDriver: true }),
    ]).start();
  }, [visible, translateY, backdropOpacity]);

  const closeAnimated = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  };

  // Sort alphabetically for the "all" list
  const sorted = useMemo(
    () => [...places].sort((a, b) => a.label.localeCompare(b.label, 'bg')),
    [places],
  );

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={closeAnimated}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} />
        </Animated.View>
        <Animated.View style={[styles.placesSheet, { paddingBottom: Math.max(insets.bottom, 16) + 8, transform: [{ translateY }] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Всички места</Text>
            <Pressable onPress={closeAnimated} hitSlop={12}>
              <Ionicons name="close" size={22} color={COLORS.secondary} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {sorted.map((place) => (
              <Pressable
                key={place.value}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(place);
                  closeAnimated();
                }}
                style={({ pressed }) => [styles.placeRow, pressed && styles.placeRowPressed]}>
                <Text style={styles.placeRowLabel}>{place.label}</Text>
                <Text style={styles.placeRowCount}>{place.count}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();

  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recentTerms, setRecentTerms] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [allPlacesVisible, setAllPlacesVisible] = useState(false);
  const [catsExpanded, setCatsExpanded] = useState(false);
  const [placesExpanded, setPlacesExpanded] = useState(false);
  const lastPersistedQuery = useRef<string | null>(null);

  // Deep-link seed
  useEffect(() => {
    const raw = params.q;
    const q = Array.isArray(raw) ? raw[0] : raw;
    if (!q || typeof q !== 'string') return;
    const trimmed = q.trim();
    if (!trimmed) return;
    setInput(trimmed);
    setDebounced(trimmed);
  }, [params.q]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim();
      setDebounced(next);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (debounced.length < 2 && !hasActiveFilters(activeFilters)) {
      lastPersistedQuery.current = null;
    }
  }, [debounced, activeFilters]);

  const refreshRecents = useCallback(() => {
    void getRecentSearches().then(setRecentTerms);
  }, []);
  useFocusEffect(useCallback(() => { refreshRecents(); }, [refreshRecents]));

  // ── Queries ─────────────────────────────────────────────────────────────
  const showDiscovery = debounced.length < 2 && !hasActiveFilters(activeFilters);
  const searchEnabled = debounced.length >= 2 || hasActiveFilters(activeFilters);

  const searchQuery = useQuery({
    queryKey: ['search', debounced, activeFilters],
    queryFn: () => searchFestivals(debounced, activeFilters),
    enabled: searchEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const thisWeekQuery = useQuery({
    queryKey: ['festivals', 'discovery', 'this_week'],
    queryFn: () => getFestivals({ when: 'this_week', sort: 'trending', limit: 8 }),
    enabled: showDiscovery,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  const metaQuery = useQuery({
    queryKey: ['discovery', 'meta'],
    queryFn: () => getDiscoveryMeta(),
    enabled: showDiscovery,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
  });

  // Persist recent search
  useEffect(() => {
    if (!searchEnabled || debounced.length < 2) return;
    if (searchQuery.fetchStatus !== 'idle' || !searchQuery.isSuccess) return;
    if (lastPersistedQuery.current === debounced) return;
    lastPersistedQuery.current = debounced;
    void addRecentSearch(debounced).then(() => refreshRecents());
    void trackEvent({ event: 'search_query', metadata: { query: debounced, resultCount: searchQuery.data?.length ?? 0 } });
  }, [debounced, refreshRecents, searchEnabled, searchQuery.data?.length, searchQuery.fetchStatus, searchQuery.isSuccess]);

  const inputTrim = input.trim();
  const isDebouncing = inputTrim.length >= 2 && inputTrim !== debounced;

  const groupedSections = useMemo(() => groupSearchResultsByDate(searchQuery.data ?? []), [searchQuery.data]);
  const totalResultCount = searchQuery.data?.length ?? 0;
  const filtersActive = hasActiveFilters(activeFilters);

  const allCategories = metaQuery.data?.categories ?? [];
  const allPlaces     = metaQuery.data?.places     ?? [];
  const collapsedCount = CHIPS_PER_ROW * 2;

  // Split into rows for the 2-row grid
  const catRow0 = allCategories.slice(0, CHIPS_PER_ROW);
  const catRow1 = allCategories.slice(CHIPS_PER_ROW, collapsedCount);
  const catExtra = allCategories.slice(collapsedCount);
  const visibleCatRows = catsExpanded
    ? [catRow0, catRow1, ...chunkArray(catExtra, CHIPS_PER_ROW)]
    : [catRow0, catRow1].filter((r) => r.length > 0);

  const placeRow0 = allPlaces.slice(0, CHIPS_PER_ROW);
  const placeRow1 = allPlaces.slice(CHIPS_PER_ROW, collapsedCount);
  const placeExtra = allPlaces.slice(collapsedCount);
  const visiblePlaceRows = placesExpanded
    ? [placeRow0, placeRow1, ...chunkArray(placeExtra, CHIPS_PER_ROW)]
    : [placeRow0, placeRow1].filter((r) => r.length > 0);

  const applyTerm = useCallback((term: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInput(term);
    setDebounced(term.trim());
  }, []);

  const goBackFromSearch = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openFestival = useCallback((item: FestivalListItem) => {
    const existing = queryClient.getQueryData(['festival', item.slug]);
    if (!existing) {
      void queryClient.prefetchQuery({
        queryKey: ['festival', item.slug],
        queryFn: () => getFestivalBySlug(item.slug),
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
      });
    }
    router.push(festivalDetailHref(item.slug));
  }, [router]);

  const onSave = useCallback((item: FestivalListItem) => {
    const id = item.festivalId;
    setPendingIds((prev) => new Set(prev).add(id));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSavedMutation.mutate(
      { festivalId: item.festivalId, slug: item.slug, festival: item },
      {
        onSettled: () => {
          setPendingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        },
      },
    );
  }, [toggleSavedMutation]);

  const renderResultRow = useCallback(
    ({ item }: SectionListRenderItemInfo<FestivalListItem, GroupedSearchSection>) => (
      <SearchResultCard
        item={item}
        onPressCard={() => openFestival(item)}
        onPressSave={() => onSave(item)}
        saveDisabled={pendingIds.has(item.festivalId)}
      />
    ),
    [onSave, openFestival, pendingIds],
  );

  const showResultsShell = searchEnabled;
  const showLoading = showResultsShell && (isDebouncing || searchQuery.isPending || (searchQuery.isFetching && !searchQuery.data));
  const showError = showResultsShell && searchQuery.isError && !isDebouncing;
  const showEmpty = showResultsShell && !isDebouncing && !searchQuery.isPending && searchQuery.isSuccess && totalResultCount === 0;
  const showGrouped = showResultsShell && !isDebouncing && searchQuery.isSuccess && totalResultCount > 0;

  const searchListExtrasKey = `${searchQuery.dataUpdatedAt}|${[...pendingIds].sort().join(',')}`;
  const topPad = insets.top + 8;

  return (
    <>
      <View style={[styles.screen, { paddingTop: topPad }]}>

        {/* Search bar */}
        <View style={styles.searchBarWrap}>
          <SearchBar
            value={input}
            onChangeText={setInput}
            onBack={goBackFromSearch}
            onClear={() => { setInput(''); setDebounced(''); Keyboard.dismiss(); }}
          />
        </View>

        {/* Filter bar — visible when results/browse mode */}
        {showResultsShell ? (
          <View style={styles.filterBar}>
            <View style={styles.filterChipsWrap}>
              <ActiveFilterChips filters={activeFilters} onUpdate={setActiveFilters} />
            </View>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterSheetVisible(true);
              }}
              style={({ pressed }) => [
                styles.filterBtn,
                filtersActive && styles.filterBtnActive,
                pressed && styles.filterBtnPressed,
              ]}>
              <Ionicons name="options-outline" size={16} color={filtersActive ? '#FFFFFF' : COLORS.text} />
              <Text style={[styles.filterBtnText, filtersActive && styles.filterBtnTextActive]}>
                Филтри
              </Text>
              {filtersActive ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {[activeFilters.when, activeFilters.city, activeFilters.category, activeFilters.free].filter(Boolean).length}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}

        {/* ── Discovery ─────────────────────────────────────────────── */}
        {showDiscovery ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.discoveryContent, { paddingBottom: insets.bottom + 28 }]}>

            {/* Скорошни (inline, без header) */}
            {recentTerms.length > 0 ? (
              <View style={styles.recentRow}>
                <Ionicons name="time-outline" size={14} color={COLORS.secondary} style={styles.recentIcon} />
                <RecentSearches terms={recentTerms} onSelectTerm={applyTerm} />
              </View>
            ) : null}

            {/* ── Кога ─────────────────────────────────────────────── */}
            <View style={styles.discSection}>
              <Text style={styles.discTitle}>Кога</Text>
              <View style={styles.whenGrid}>
                {WHEN_OPTIONS.map((opt) => (
                  <PressableScale
                    key={opt.value}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveFilters({ when: opt.value });
                    }}
                    pressedScale={0.96}
                    pressedOpacity={0.82}
                    style={styles.whenChip}>
                    <Text style={styles.whenChipText}>{opt.label}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {/* ── Тази седмица preview ──────────────────────────────── */}
            {(thisWeekQuery.data?.length ?? 0) > 0 ? (
              <View style={styles.discSection}>
                <Text style={styles.discTitle}>Тази седмица</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.thisWeekScroll}>
                  {(thisWeekQuery.data ?? []).map((item) => (
                    <ThisWeekMiniCard key={item.festivalId} item={item} onPress={() => openFestival(item)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* ── Категории ─────────────────────────────────────────── */}
            <View style={styles.discSection}>
              <Text style={styles.discTitle}>Категории</Text>
              {metaQuery.isPending ? (
                <View style={styles.chipRows}>
                  {[0, 1].map((ri) => (
                    <View key={ri} style={styles.chipRowContent}>
                      {[0, 1, 2, 3].map((ci) => (
                        <View key={ci} style={styles.chipSkeleton} />
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.chipRows}>
                {visibleCatRows.map((row, ri) => (
                  <ScrollView
                    key={ri}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.chipRowContent}>
                    {row.map((cat) => (
                      <Pressable
                        key={cat.value}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveFilters({ category: cat.value });
                        }}
                        style={({ pressed }) => [styles.discChip, pressed && styles.discChipPressed]}>
                        <Text style={styles.discChipText}>{cat.value}</Text>
                        {cat.count > 0 ? <Text style={styles.discChipCount}>{cat.count}</Text> : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                ))}
              </View>
              {allCategories.length > collapsedCount ? (
                <Pressable
                  onPress={() => setCatsExpanded((v) => !v)}
                  style={({ pressed }) => [styles.moreBtn, pressed && styles.moreBtnPressed]}>
                  <Text style={styles.moreBtnText}>
                    {catsExpanded ? 'По-малко' : `Още ${allCategories.length - collapsedCount}`}
                  </Text>
                  <Ionicons name={catsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#4F46E5" />
                </Pressable>
              ) : null}
            </View>

            {/* ── Места ─────────────────────────────────────────────── */}
            <View style={styles.discSection}>
              <View style={styles.discTitleRow}>
                <Text style={styles.discTitle}>Места</Text>
                {allPlaces.length > collapsedCount ? (
                  <Pressable
                    onPress={() => setAllPlacesVisible(true)}
                    style={({ pressed }) => [styles.allBtn, pressed && { opacity: 0.75 }]}>
                    <Text style={styles.allBtnText}>Всички</Text>
                    <Ionicons name="list-outline" size={14} color="#4F46E5" />
                  </Pressable>
                ) : null}
              </View>
              {metaQuery.isPending ? (
                <View style={styles.chipRows}>
                  {[0, 1].map((ri) => (
                    <View key={ri} style={styles.chipRowContent}>
                      {[0, 1, 2, 3].map((ci) => (
                        <View key={ci} style={styles.chipSkeleton} />
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.chipRows}>
                {visiblePlaceRows.map((row, ri) => (
                  <ScrollView
                    key={ri}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.chipRowContent}>
                    {row.map((place) => (
                      <Pressable
                        key={place.value}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveFilters({ city: place.value });
                        }}
                        style={({ pressed }) => [styles.discChip, pressed && styles.discChipPressed]}>
                        <Text style={styles.discChipText}>{place.label}</Text>
                        {place.count > 0 ? <Text style={styles.discChipCount}>{place.count}</Text> : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : null}

        {/* ── Results ────────────────────────────────────────────────── */}
        {showResultsShell ? (
          <View style={styles.resultsPane}>
            {showLoading ? <SearchResultsSkeleton /> : null}

            {showError ? (
              <View style={styles.centerBlock}>
                <Text style={styles.errorText}>Възникна грешка при търсенето.</Text>
                <Pressable
                  onPress={() => searchQuery.refetch()}
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
                  <Text style={styles.retryBtnText}>Опитай отново</Text>
                </Pressable>
              </View>
            ) : null}

            {showEmpty ? (
              <View style={styles.centerBlock}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>Няма намерени събития</Text>
                <Text style={styles.emptyHint}>
                  {filtersActive
                    ? 'Опитай с по-малко филтри или друга дума.'
                    : 'Провери изписването или опитай с по-кратка дума.'}
                </Text>
                {filtersActive ? (
                  <Pressable
                    onPress={() => setActiveFilters(EMPTY_FILTERS)}
                    style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed, { marginTop: 12 }]}>
                    <Text style={styles.retryBtnText}>Изчисти филтрите</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {showGrouped ? (
              <>
                <Text style={styles.resultCount}>
                  {totalResultCount === 1 ? '1 резултат' : `${totalResultCount} резултата`}
                  {filtersActive ? ' · с филтри' : ''}
                </Text>
                <SectionList<FestivalListItem, GroupedSearchSection>
                  sections={groupedSections}
                  keyExtractor={(item) => item.festivalId}
                  renderItem={renderResultRow}
                  renderSectionHeader={({ section }) => (
                    <Text style={[festivalUi.typography.sectionTitle, styles.sectionHeader]}>
                      {section.title}
                    </Text>
                  )}
                  stickySectionHeadersEnabled={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  removeClippedSubviews
                  initialNumToRender={8}
                  windowSize={7}
                  maxToRenderPerBatch={12}
                  extraData={searchListExtrasKey}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                  SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
                  refreshControl={
                    <RefreshControl
                      refreshing={searchQuery.isRefetching && !searchQuery.isPending}
                      onRefresh={() => searchQuery.refetch()}
                      tintColor={COLORS.text}
                      colors={[COLORS.text]}
                    />
                  }
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Sheets */}
      <SearchFilterSheet
        visible={filterSheetVisible}
        filters={activeFilters}
        onApply={(next) => { setActiveFilters(next); setFilterSheetVisible(false); }}
        onClose={() => setFilterSheetVisible(false)}
      />
      <AllPlacesSheet
        visible={allPlacesVisible}
        places={allPlaces}
        onSelect={(place) => setActiveFilters({ city: place.value })}
        onClose={() => setAllPlacesVisible(false)}
      />
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  searchBarWrap: { paddingHorizontal: festivalUi.screenPadding, marginBottom: 8 },

  // Filter bar
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: festivalUi.screenPadding, marginBottom: 10, gap: 8 },
  filterChipsWrap: { flex: 1, minWidth: 0 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  filterBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4338CA' },
  filterBtnPressed: { opacity: 0.82 },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  filterBtnTextActive: { color: '#FFFFFF' },
  filterBadge: { width: 17, height: 17, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: '#4F46E5' },

  // Discovery
  discoveryContent: { paddingHorizontal: festivalUi.screenPadding, paddingTop: 4 },
  recentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  recentIcon: { marginRight: 6, marginTop: 1 },
  discSection: { marginBottom: 24 },
  discTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  discTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },

  // Кога
  whenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  whenChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  whenChipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  // Тази седмица cards
  thisWeekScroll: { gap: 10, paddingBottom: 4 },
  miniCard: { width: 180, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  miniCardPressed: { opacity: 0.85 },
  miniThumb: { width: '100%', height: 100, backgroundColor: '#F3F4F6' },
  miniThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  miniThumbEmoji: { fontSize: 28 },
  miniBody: { paddingHorizontal: 10, paddingVertical: 9, gap: 3 },
  miniTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 18 },
  miniMeta: { fontSize: 12, color: COLORS.secondary },

  // Categories & Places two-row layout
  chipRows: { gap: 8 },
  chipRowContent: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  chipSkeleton: { height: 36, width: 90, borderRadius: 12, backgroundColor: '#E5E7EB' },
  discChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  discChipPressed: { opacity: 0.75 },
  discChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  discChipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: '#9CA3AF',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  // Още / All buttons
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 2 },
  moreBtnPressed: { opacity: 0.75 },
  moreBtnText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  allBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  allBtnText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },

  // Results
  resultsPane: { flex: 1, paddingHorizontal: festivalUi.screenPadding },
  resultCount: { fontSize: 12, fontWeight: '600', color: COLORS.secondary, marginBottom: 10 },
  sectionHeader: { marginBottom: 10, marginTop: 4, fontSize: 18 },
  sectionSep: { height: 8 },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, minHeight: 220 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptyHint: { marginTop: 8, fontSize: 15, color: COLORS.secondary, textAlign: 'center', lineHeight: 22 },
  errorText: { fontSize: 15, color: COLORS.secondary, textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: COLORS.text, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  retryBtnPressed: { opacity: 0.88 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // Skeleton
  skeletonBlock: { paddingTop: 8 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  skeletonThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#E5E7EB' },
  skeletonBody: { flex: 1, gap: 8 },
  skeletonLineLg: { height: 14, borderRadius: 6, backgroundColor: '#E5E7EB', width: '88%' },
  skeletonLineSm: { height: 12, borderRadius: 6, backgroundColor: '#F3F4F6', width: '70%' },
  skeletonLineMd: { height: 12, borderRadius: 6, backgroundColor: '#E5E7EB', width: '52%' },
  skeletonSave: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#E5E7EB' },

  // All Places sheet
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.42)' },
  placesSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 20, paddingTop: 10, maxHeight: '80%' },
  sheetHandle: { width: 46, height: 4, borderRadius: 999, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 12 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  placeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  placeRowPressed: { opacity: 0.75, backgroundColor: '#F9FAFB' },
  placeRowLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  placeRowCount: { fontSize: 13, fontWeight: '600', color: COLORS.secondary },
});
