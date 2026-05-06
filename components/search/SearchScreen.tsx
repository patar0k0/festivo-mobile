import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  UIManager,
  View,
  type SectionListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopularCategories } from '@/components/search/PopularCategories';
import { PopularCities } from '@/components/search/PopularCities';
import { RecentSearches } from '@/components/search/RecentSearches';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { SearchSection } from '@/components/search/SearchSection';
import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getFestivalBySlug } from '@/lib/api/festivals';
import { searchFestivals } from '@/lib/api/search';
import { groupSearchResultsByDate, type GroupedSearchSection } from '@/lib/search/groupSearchResults';
import { addRecentSearch, getRecentSearches } from '@/lib/search/recentSearches';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { queryClient } from '@/lib/queryClient';

const COLORS = festivalUi.colors;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <ResultSkeletonRow key={k} />
      ))}
    </View>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recentTerms, setRecentTerms] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const lastPersistedQuery = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim();
      setDebounced(next);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (debounced.length < 2) {
      lastPersistedQuery.current = null;
    }
  }, [debounced]);

  const refreshRecents = useCallback(() => {
    void getRecentSearches().then(setRecentTerms);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshRecents();
    }, [refreshRecents]),
  );

  const searchEnabled = debounced.length >= 2;
  const searchQuery = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchFestivals(debounced),
    enabled: searchEnabled,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (!searchEnabled) return;
    if (searchQuery.fetchStatus !== 'idle' || !searchQuery.isSuccess) return;
    if (lastPersistedQuery.current === debounced) return;
    lastPersistedQuery.current = debounced;
    void addRecentSearch(debounced).then(() => refreshRecents());
  }, [debounced, refreshRecents, searchEnabled, searchQuery.fetchStatus, searchQuery.isSuccess]);

  const inputTrim = input.trim();
  const isDebouncing = inputTrim.length >= 2 && inputTrim !== debounced;

  const groupedSections = useMemo(() => {
    const list = searchQuery.data ?? [];
    return groupSearchResultsByDate(list);
  }, [searchQuery.data]);

  const applyTerm = useCallback((term: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const t = term.trim();
    setInput(term);
    setDebounced(t);
  }, []);

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

  const showDiscovery = debounced.length < 2;
  const showResultsShell = debounced.length >= 2;
  const showLoading =
    showResultsShell && (isDebouncing || searchQuery.isPending || (searchQuery.isFetching && !searchQuery.data));
  const showError = showResultsShell && searchQuery.isError && !isDebouncing;
  const showEmpty =
    showResultsShell &&
    !isDebouncing &&
    !searchQuery.isPending &&
    searchQuery.isSuccess &&
    (searchQuery.data?.length ?? 0) === 0;
  const showGrouped = showResultsShell && !isDebouncing && searchQuery.isSuccess && (searchQuery.data?.length ?? 0) > 0;

  const topPad = insets.top + 8;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <View style={styles.searchBarWrap}>
        <SearchBar
          value={input}
          onChangeText={setInput}
          onBack={() => router.back()}
          onClear={() => {
            setInput('');
            setDebounced('');
            Keyboard.dismiss();
          }}
        />
      </View>

      {showDiscovery ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.discoveryContent,
            { paddingBottom: insets.bottom + 28 },
          ]}>
          <SearchSection title="Скорошни търсения">
            <RecentSearches terms={recentTerms} onSelectTerm={applyTerm} />
            {recentTerms.length === 0 ? (
              <Text style={styles.mutedHint}>Още няма запазени търсения. Започни да пишеш по-горе.</Text>
            ) : null}
          </SearchSection>

          <SearchSection title="Популярни категории">
            <PopularCategories onSelectCategory={applyTerm} />
          </SearchSection>

          <SearchSection title="Градове">
            <PopularCities onSelectCity={applyTerm} />
          </SearchSection>
        </ScrollView>
      ) : null}

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
              <Text style={styles.emptyTitle}>Няма намерени събития</Text>
              <Text style={styles.emptyHint}>Опитай друга дума или избери категория по-горе.</Text>
            </View>
          ) : null}

          {showGrouped ? (
            <>
              <Text style={styles.rankHint} accessibilityRole="text">
                Подредено по релевантност — най-близките съвпадения и активни събития са отгоре.
              </Text>
              <SectionList<FestivalListItem, GroupedSearchSection>
              sections={groupedSections}
              keyExtractor={(item) => item.festivalId}
              renderItem={renderResultRow}
              renderSectionHeader={({ section }) => (
                <Text style={[festivalUi.typography.sectionTitle, styles.sectionHeader]}>{section.title}</Text>
              )}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              removeClippedSubviews
              initialNumToRender={8}
              windowSize={7}
              maxToRenderPerBatch={12}
              extraData={pendingIds}
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  searchBarWrap: {
    paddingHorizontal: festivalUi.screenPadding,
    marginBottom: 12,
  },
  discoveryContent: {
    paddingHorizontal: festivalUi.screenPadding,
  },
  resultsPane: {
    flex: 1,
    paddingHorizontal: festivalUi.screenPadding,
  },
  rankHint: {
    ...festivalUi.typography.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    opacity: 0.92,
  },
  mutedHint: {
    ...festivalUi.typography.secondary,
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 4,
    fontSize: 18,
  },
  sectionSep: {
    height: 8,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    minHeight: 220,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    fontSize: 15,
    color: COLORS.secondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: COLORS.text,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryBtnPressed: {
    opacity: 0.88,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  skeletonBlock: {
    paddingTop: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  skeletonThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
  skeletonLineLg: {
    height: 14,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    width: '88%',
  },
  skeletonLineSm: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    width: '70%',
  },
  skeletonLineMd: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    width: '52%',
  },
  skeletonSave: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
});
