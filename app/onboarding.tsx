import { Image as ExpoImage } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  getOnboardingSuggestions,
  type OnboardingCategorySuggestion,
  type OnboardingCitySuggestion,
  type OnboardingOrganizerSuggestion,
  type OnboardingSuggestionsResponse,
} from '@/lib/api/onboardingSuggestions';
import {
  mergeOnboardingCategorySuggestions,
  normalizeCategoryLabelKey,
  resolveCanonicalCategorySlug,
  type MergedCategorySuggestion,
} from '@/lib/personalization/onboardingCategoryNormalize';
import { prepareOnboardingOrganizerSuggestions } from '@/lib/personalization/onboardingOrganizersNormalize';
import {
  EMPTY_ONBOARDING_DRAFT,
  getOnboardingDraft,
  saveOnboardingDraft,
  syncOnboardingToBackend,
  type OnboardingDraft,
} from '@/lib/personalization/onboarding';

const NOTIFICATION_OPTIONS = ['categories', 'cities', 'organizers', 'nearby', 'trending'];

const SESSION_SUGGESTIONS_CACHE: {
  payload: OnboardingSuggestionsResponse | null;
} = { payload: null };

const CATEGORY_META: Record<string, { emoji: string; label: string; hint?: string }> = {
  music: { emoji: '🎵', label: 'Музика', hint: 'Концерти и клубни събития' },
  food: { emoji: '🍲', label: 'Храна', hint: 'Street food и гурме пазари' },
  culture: { emoji: '🎭', label: 'Култура', hint: 'Театър, изложби и арт' },
  family: { emoji: '👨‍👩‍👧', label: 'Семейни', hint: 'За деца и родители' },
  crafts: { emoji: '🧶', label: 'Занаяти', hint: 'Базари и местни творци' },
};

const ICON_TO_EMOJI: Record<string, string> = {
  music: '🎵',
  traditional: '🎻',
  food: '🍲',
  crafts: '🧶',
  palette: '🎨',
  culture: '🎭',
  family: '👨‍👩‍👧',
  dance: '💃',
  film: '🎬',
  theatre: '🎭',
  market: '🛍️',
  sports: '🏅',
  festival: '🎉',
};

const NOTIFICATION_META: Record<string, string> = {
  categories: 'Нови фестивали по категории',
  cities: 'Нови събития по градове',
  organizers: 'Новини от следвани организатори',
  nearby: 'Наблизо тази седмица',
  trending: 'Трендинг фестивали',
};

function AnimatedChip({
  label,
  selected,
  subtitle,
  emoji,
  badge,
  onPress,
  accessibilityLabel,
  compact,
}: {
  label: string;
  selected: boolean;
  subtitle?: string;
  emoji?: string;
  badge?: string;
  onPress: () => void;
  accessibilityLabel: string;
  compact?: boolean;
}) {
  const pressScale = useSharedValue(1);
  useEffect(() => {
    pressScale.value = withSpring(selected ? 1.02 : 1, { damping: 14, stiffness: 180 });
  }, [pressScale, selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  return (
    <Animated.View style={animatedStyle} layout={LinearTransition.springify()}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.richChip,
          compact && styles.richChipCompact,
          selected && styles.richChipActive,
        ]}>
        <View style={styles.chipTitleRow}>
          <Text
            style={[styles.richChipTitle, compact && styles.richChipTitleCompact, selected && styles.richChipTitleActive]}
            numberOfLines={compact ? 3 : undefined}>
            {emoji ? `${emoji} ` : ''}
            {label}
          </Text>
          {badge ? <Text style={[styles.chipBadge, selected && styles.chipBadgeActive]}>{badge}</Text> : null}
        </View>
        {subtitle ? (
          <Text
            style={[styles.richChipSub, compact && styles.richChipSubCompact, selected && styles.richChipSubActive]}
            numberOfLines={compact ? 2 : undefined}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function ToggleChips({
  values,
  selected,
  onToggle,
  labels,
}: {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <View style={styles.chipsGrid}>
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <AnimatedChip
            key={value}
            label={labels[value] ?? value}
            selected={active}
            onPress={() => onToggle(value)}
            accessibilityLabel={labels[value] ?? value}
          />
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [suggestions, setSuggestions] = useState<OnboardingSuggestionsResponse | null>(SESSION_SUGGESTIONS_CACHE.payload);
  const [suggestionsLoading, setSuggestionsLoading] = useState(!SESSION_SUGGESTIONS_CACHE.payload);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const stepAnim = useSharedValue(1);
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    void getOnboardingDraft().then((existing) => {
      if (!mounted) return;
      setDraft(existing);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (SESSION_SUGGESTIONS_CACHE.payload) {
      setSuggestions(SESSION_SUGGESTIONS_CACHE.payload);
      setSuggestionsLoading(false);
      return;
    }
    let active = true;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    void getOnboardingSuggestions({
      categories: draft.categories,
      cities: draft.cities,
    })
      .then((payload) => {
        if (!active) return;
        SESSION_SUGGESTIONS_CACHE.payload = payload;
        setSuggestions(payload);
      })
      .catch(() => {
        if (!active) return;
        setSuggestionsError('Неуспешно зареждане на предложенията.');
      })
      .finally(() => {
        if (!active) return;
        setSuggestionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrated, draft.categories, draft.cities]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const step = Math.min(4, Math.max(0, draft.step));
  const isLast = step === 4;
  useEffect(() => {
    const progress = (step + 1) / 5;
    progressAnim.value = withTiming(progress, { duration: reduceMotion ? 0 : 320, easing: Easing.out(Easing.cubic) });
  }, [progressAnim, reduceMotion, step]);

  const title = useMemo(() => {
    switch (step) {
      case 0:
        return 'Кажи ни какво харесваш';
      case 1:
        return 'Избери градове за откриване';
      case 2:
        return 'Известия, които имат значение';
      case 3:
        return 'Откривай фестивали около теб';
      default:
        return 'Следвай любими организатори';
    }
  }, [step]);

  const subtitle = useMemo(() => {
    switch (step) {
      case 0:
        return 'Създай твоя персонален фийд за секунди.';
      case 1:
        return 'Ще показваме първо най-подходящите събития наблизо.';
      case 2:
        return 'Избери какво искаш да получаваш, без излишен шум.';
      case 3:
        return 'Виж какво се случва до теб още този уикенд.';
      default:
        return 'Подбрали сме профили според твоите интереси.';
    }
  }, [step]);
  const categorySuggestions = useMemo(
    (): OnboardingCategorySuggestion[] => suggestions?.categories ?? [],
    [suggestions],
  );
  const citySuggestions = useMemo((): OnboardingCitySuggestion[] => suggestions?.cities ?? [], [suggestions]);
  const organizerSuggestionsRaw = useMemo(
    (): OnboardingOrganizerSuggestion[] => suggestions?.organizers ?? [],
    [suggestions],
  );

  const mergedCategories = useMemo(
    () => mergeOnboardingCategorySuggestions(categorySuggestions),
    [categorySuggestions],
  );

  const organizerSuggestions = useMemo(
    () => prepareOnboardingOrganizerSuggestions(organizerSuggestionsRaw),
    [organizerSuggestionsRaw],
  );

  const categoryOptions = useMemo(() => {
    const slugs = new Set<string>(mergedCategories.map((m) => m.slug));
    for (const raw of draft.categories) {
      slugs.add(resolveCanonicalCategorySlug(raw, mergedCategories));
    }
    const labelFor = (slug: string) =>
      mergedCategories.find((m) => m.slug === slug)?.label_bg ?? CATEGORY_META[slug]?.label ?? slug;
    return [...slugs].sort((a, b) => labelFor(a).localeCompare(labelFor(b), 'bg'));
  }, [mergedCategories, draft.categories]);

  const categoryLabelBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mergedCategories) {
      map[m.slug] = m.label_bg;
      for (const s of m.mergedSlugs) map[s] = m.label_bg;
    }
    for (const slug of draft.categories) {
      if (!map[slug]) map[slug] = CATEGORY_META[slug]?.label ?? slug;
    }
    return map;
  }, [mergedCategories, draft.categories]);

  const categoryEmojiBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mergedCategories) {
      const fromIcon = m.icon ? ICON_TO_EMOJI[m.icon] : undefined;
      const emoji = fromIcon ?? CATEGORY_META[m.slug]?.emoji ?? '🎉';
      map[m.slug] = emoji;
      for (const s of m.mergedSlugs) map[s] = emoji;
    }
    for (const slug of draft.categories) {
      if (!map[slug]) map[slug] = CATEGORY_META[slug]?.emoji ?? '🎉';
    }
    return map;
  }, [mergedCategories, draft.categories]);

  const cityOptions = useMemo(() => {
    const merged = new Set<string>(citySuggestions.map((x) => x.slug));
    for (const selected of draft.cities) merged.add(selected);
    return [...merged];
  }, [citySuggestions, draft.cities]);
  const cityLabelBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const city of citySuggestions) {
      map[city.slug] = city.name_bg;
    }
    for (const slug of draft.cities) {
      if (!map[slug]) map[slug] = slug;
    }
    return map;
  }, [citySuggestions, draft.cities]);

  const persist = async (next: OnboardingDraft) => {
    setDraft(next);
    await saveOnboardingDraft(next);
  };

  const toggleArray = (key: 'categories' | 'cities' | 'notificationInterests' | 'organizerIds', value: string) => {
    const set = new Set(draft[key]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    void persist({ ...draft, [key]: [...set] });
  };

  const toggleMergedCategory = (row: MergedCategorySuggestion) => {
    const set = new Set(draft.categories);
    const on = row.mergedSlugs.some((s) => set.has(s)) || set.has(row.slug);
    if (on) {
      for (const s of row.mergedSlugs) set.delete(s);
      set.delete(row.slug);
    } else {
      for (const s of row.mergedSlugs) set.delete(s);
      set.add(row.slug);
    }
    void persist({ ...draft, categories: [...set] });
  };

  const isMergedCategorySelected = (canonicalSlug: string) => {
    const row = mergedCategories.find((m) => m.slug === canonicalSlug);
    if (!row) return draft.categories.includes(canonicalSlug);
    return row.mergedSlugs.some((s) => draft.categories.includes(s)) || draft.categories.includes(row.slug);
  };

  const onCategoryChipPress = (canonicalSlug: string) => {
    const row = mergedCategories.find((m) => m.slug === canonicalSlug);
    if (row) toggleMergedCategory(row);
    else toggleArray('categories', canonicalSlug);
  };

  const categoryGridInnerWidth = Math.max(0, windowWidth - 40 - 36);
  const categoryChipMinWidth = Math.min(152, categoryGridInnerWidth * 0.46);

  const goNext = () => {
    const nextStep = Math.min(4, step + 1);
    stepAnim.value = withTiming(0.98, { duration: reduceMotion ? 0 : 110 }, () => {
      stepAnim.value = withSpring(1, { damping: 16, stiffness: 210 });
    });
    void persist({ ...draft, step: nextStep });
  };

  const requestLocation = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      void persist({ ...draft, locationPermissionAsked: true });
    }
  };
  useEffect(() => {
    if (!draft.locationPermissionAsked) return;
    let mounted = true;
    void Location.getLastKnownPositionAsync().then((position) => {
      if (!mounted || !position) return;
      const latitude = position.coords.latitude;
      if (latitude > 42.6) setDetectedCity('sofia');
      else if (latitude > 42.1) setDetectedCity('plovdiv');
      else setDetectedCity('varna');
    });
    return () => {
      mounted = false;
    };
  }, [draft.locationPermissionAsked]);

  const finish = async (skipped: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    const finalState: OnboardingDraft = { ...draft, completed: !skipped, skipped, step: 4 };
    await persist(finalState);
    try {
      await syncOnboardingToBackend(finalState);
    } catch {
      // keep flow resilient; local state remains saved for resume/retry
    } finally {
      setSubmitting(false);
      router.replace('/(tabs)');
    }
  };

  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progressAnim.value }],
  }));
  const stepCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stepAnim.value }],
  }));
  const filteredCities = cityOptions.filter((city) =>
    (cityLabelBySlug[city] ?? city).toLowerCase().includes(cityQuery.trim().toLowerCase()),
  );
  const suggestedCities = filteredCities.filter((city) => city === detectedCity || citySuggestions.some((c) => c.slug === city));
  const otherCities = filteredCities.filter((city) => !suggestedCities.includes(city));
  const showSuggestionsRetry = Boolean(suggestionsError) && !suggestionsLoading;

  const retrySuggestions = () => {
    setSuggestionsError(null);
    setSuggestionsLoading(true);
    void getOnboardingSuggestions({
      categories: draft.categories,
      cities: draft.cities,
    })
      .then((payload) => {
        SESSION_SUGGESTIONS_CACHE.payload = payload;
        setSuggestions(payload);
      })
      .catch(() => {
        setSuggestionsError('Неуспешно зареждане на предложенията.');
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  };

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Зареждаме персонализация...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.stepLabel}>Стъпка {step + 1} от 5</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled">
        <Animated.View
          key={`step-${step}`}
          entering={reduceMotion ? undefined : FadeIn.duration(200)}
          exiting={reduceMotion ? undefined : FadeOut.duration(150)}
          style={[styles.card, stepCardStyle]}
          layout={LinearTransition.springify()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {showSuggestionsRetry ? (
            <View style={styles.retryBox}>
              <Text style={styles.retryText}>Не успяхме да заредим персонализирани предложения.</Text>
              <Pressable onPress={retrySuggestions} style={styles.retryBtn} accessibilityRole="button">
                <Text style={styles.retryBtnText}>Опитай отново</Text>
              </Pressable>
            </View>
          ) : null}

          {step === 0 ? (
            <>
              <Text style={styles.guidance}>Избери поне 2 категории за по-точни препоръки.</Text>
              {suggestionsLoading && categoryOptions.length === 0 ? (
                <View style={styles.chipsGridTwoCol}>
                  {[0, 1, 2, 3].map((idx) => (
                    <View
                      key={`cat-sk-${idx}`}
                      style={[styles.chipGridCell, { minWidth: categoryChipMinWidth, flexGrow: 1 }]}>
                      <Skeleton height={76} radius={14} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.chipsGridTwoCol}>
                  {categoryOptions.map((value) => {
                    const selected = isMergedCategorySelected(value);
                    const label = categoryLabelBySlug[value] ?? CATEGORY_META[value]?.label ?? value;
                    return (
                      <View
                        key={value}
                        style={[styles.chipGridCell, { minWidth: categoryChipMinWidth, flexGrow: 1 }]}>
                        <AnimatedChip
                          compact
                          emoji={categoryEmojiBySlug[value] ?? CATEGORY_META[value]?.emoji}
                          label={label}
                          subtitle={CATEGORY_META[value]?.hint}
                          selected={selected}
                          onPress={() => onCategoryChipPress(value)}
                          accessibilityLabel={label}
                          badge={selected ? 'Избрано' : undefined}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <TextInput
                value={cityQuery}
                onChangeText={setCityQuery}
                placeholder="Търси град (по избор)"
                style={styles.searchInput}
                placeholderTextColor="#94A3B8"
                accessibilityLabel="Търсене на град"
              />
              <Text style={styles.sectionTitle}>Предложени</Text>
              {suggestionsLoading && cityOptions.length === 0 ? (
                <View style={styles.cityGrid}>
                  {[0, 1, 2].map((idx) => (
                    <Skeleton key={`city-sk-${idx}`} height={48} radius={16} />
                  ))}
                </View>
              ) : (
                <View style={styles.cityGrid}>
                  {suggestedCities.map((city) => (
                    <AnimatedChip
                      key={city}
                      label={cityLabelBySlug[city] ?? city}
                      selected={draft.cities.includes(city)}
                      onPress={() => toggleArray('cities', city)}
                      accessibilityLabel={cityLabelBySlug[city] ?? city}
                      badge={city === detectedCity ? 'Наблизо' : 'Популярно'}
                    />
                  ))}
                </View>
              )}
              {otherCities.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Още градове</Text>
                  <View style={styles.cityGrid}>
                    {otherCities.map((city) => (
                      <AnimatedChip
                        key={city}
                        label={cityLabelBySlug[city] ?? city}
                        selected={draft.cities.includes(city)}
                        onPress={() => toggleArray('cities', city)}
                        accessibilityLabel={cityLabelBySlug[city] ?? city}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <ToggleChips
              values={NOTIFICATION_OPTIONS}
              selected={draft.notificationInterests}
              onToggle={(v) => toggleArray('notificationInterests', v)}
              labels={NOTIFICATION_META}
            />
          ) : null}

          {step === 3 ? (
            <View style={styles.locationCard}>
              <View style={styles.locationVisual}>
                <Text style={styles.locationEmoji}>📍</Text>
                <Text style={styles.locationVisualText}>Фестивали близо до теб</Text>
              </View>
              <Text style={styles.locationTrust}>
                Локацията е по избор и се използва само за по-близки предложения, без споделяне с други потребители.
              </Text>
              <Pressable onPress={requestLocation} style={styles.permissionBtn} accessibilityRole="button">
                <Text style={styles.permissionBtnText}>
                  {draft.locationPermissionAsked ? 'Локацията е заявена' : 'Разреши локация (по избор)'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.organizerList}>
              {suggestionsLoading && organizerSuggestions.length === 0
                ? [0, 1, 2].map((idx) => (
                    <View key={`org-sk-${idx}`} style={styles.organizerCard}>
                      <View style={styles.organizerHeroRow}>
                        <Skeleton width={52} height={52} radius={14} />
                        <View style={{ flex: 1, gap: 6 }}>
                          <Skeleton width="60%" height={14} />
                          <Skeleton width="45%" height={12} />
                        </View>
                        <Skeleton width={64} height={24} radius={999} />
                      </View>
                      <Skeleton width="85%" height={12} />
                      <View style={styles.tagRow}>
                        <Skeleton width={84} height={20} radius={999} />
                        <Skeleton width={92} height={20} radius={999} />
                      </View>
                    </View>
                  ))
                : organizerSuggestions.map((organizer) => {
                    const selected = draft.organizerIds.includes(organizer.id);
                    const seenTag = new Set<string>();
                    const categoryTags = organizer.categories
                      .map((t) => t.trim())
                      .filter((t) => {
                        if (!t) return false;
                        const k = normalizeCategoryLabelKey(t);
                        if (seenTag.has(k)) return false;
                        seenTag.add(k);
                        return true;
                      })
                      .slice(0, 4);
                    const followersRaw = organizer.followers_count;
                    const showFollowers = typeof followersRaw === 'number' && followersRaw > 0;
                    const upcomingRaw = organizer.upcoming_festival_count;
                    const showUpcoming = typeof upcomingRaw === 'number' && upcomingRaw > 0;
                    return (
                      <Animated.View key={organizer.id} layout={LinearTransition.springify()}>
                        <Pressable
                          onPress={() => toggleArray('organizerIds', organizer.id)}
                          style={[styles.organizerCard, selected && styles.organizerCardActive]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Следвай ${organizer.name}`}>
                          <View style={styles.organizerHeroRow}>
                            <View style={styles.logoWrap}>
                              {organizer.logo_url ? (
                                <ExpoImage
                                  source={{ uri: organizer.logo_url }}
                                  style={styles.logo}
                                  contentFit="cover"
                                />
                              ) : (
                                <Text style={styles.logoFallback}>{organizer.name.slice(0, 1).toUpperCase()}</Text>
                              )}
                            </View>
                            <View style={styles.organizerText}>
                              <Text style={styles.organizerName} numberOfLines={2}>
                                {organizer.name}
                                {organizer.verified ? ' ✓' : ''}
                              </Text>
                              <View style={styles.organizerMetaRow}>
                                {organizer.city ? (
                                  <Text style={styles.organizerMeta} numberOfLines={1}>
                                    📍 {organizer.city}
                                  </Text>
                                ) : (
                                  <Text style={styles.organizerMeta}>Организатор</Text>
                                )}
                                {showFollowers ? (
                                  <Text style={styles.organizerMetaMuted} numberOfLines={1}>
                                    {followersRaw!.toLocaleString('bg-BG')} последователи
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={[styles.ctaBadge, selected && styles.ctaBadgeActive]}>
                              <Text style={[styles.ctaBadgeText, selected && styles.ctaBadgeTextActive]}>
                                {selected ? 'Следваш' : 'Следвай'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.whyBox}>
                            <Text style={styles.whyLabel}>Защо го предлагаме</Text>
                            <Text style={styles.whyBody}>{organizer.explanation}</Text>
                          </View>
                          {showUpcoming ? (
                            <Text style={styles.upcomingLine}>
                              Предстоящи фестивали: {upcomingRaw!.toLocaleString('bg-BG')}
                            </Text>
                          ) : null}
                          {categoryTags.length > 0 ? (
                            <View style={styles.tagRow}>
                              {categoryTags.map((tag) => (
                                <View key={`${organizer.id}-${normalizeCategoryLabelKey(tag)}`} style={styles.tagPill}>
                                  <Text style={styles.tagPillText} numberOfLines={1}>
                                    {tag}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </Pressable>
                      </Animated.View>
                    );
                  })}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]} layout={LinearTransition.springify()}>
        <Pressable onPress={() => finish(true)} style={styles.secondaryBtn} accessibilityRole="button">
          <Text style={styles.secondaryBtnText}>Пропусни засега</Text>
        </Pressable>
        {isLast ? (
          <Pressable
            onPress={() => finish(false)}
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            disabled={submitting}
            accessibilityRole="button">
            <Text style={styles.primaryBtnText}>{submitting ? 'Запазваме...' : 'Готово'}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={goNext} style={styles.primaryBtn} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>Напред</Text>
          </Pressable>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  stepLabel: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: '#0F172A', width: '100%' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },
  card: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', lineHeight: 33 },
  subtitle: { fontSize: 15, color: '#475569', lineHeight: 22 },
  guidance: { fontSize: 13, color: '#475569', fontWeight: '600' },
  chipsGrid: { gap: 8 },
  chipsGridTwoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 8, justifyContent: 'flex-start' },
  chipGridCell: { flexGrow: 1, maxWidth: '100%' },
  richChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  richChipCompact: { paddingVertical: 8, paddingHorizontal: 10, minHeight: 72, justifyContent: 'center' },
  richChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    borderWidth: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  richChipTitle: { fontSize: 14, color: '#0F172A', fontWeight: '700', flexShrink: 1 },
  richChipTitleCompact: { fontSize: 13, lineHeight: 18 },
  richChipTitleActive: { color: '#FFFFFF' },
  richChipSub: { fontSize: 12, color: '#64748B' },
  richChipSubCompact: { fontSize: 11, lineHeight: 15 },
  richChipSubActive: { color: '#CBD5E1' },
  chipBadge: { fontSize: 11, color: '#334155', fontWeight: '700', backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipBadgeActive: { color: '#0F172A', backgroundColor: '#F8FAFC' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 9 : 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: { marginTop: 4, marginBottom: 2, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3, color: '#64748B', fontWeight: '700' },
  cityGrid: { gap: 8 },
  locationCard: { borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', padding: 14, gap: 10, backgroundColor: '#F8FAFC' },
  locationVisual: { borderRadius: 12, padding: 14, backgroundColor: '#E2E8F0', alignItems: 'center', gap: 6 },
  locationEmoji: { fontSize: 24 },
  locationVisualText: { color: '#0F172A', fontWeight: '700' },
  locationTrust: { color: '#475569', fontSize: 13, lineHeight: 19 },
  permissionBtn: { borderRadius: 12, backgroundColor: '#0F172A', alignItems: 'center', paddingVertical: 11 },
  permissionBtnText: { color: '#FFFFFF', fontWeight: '700' },
  organizerList: { gap: 8 },
  organizerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  organizerCardActive: { borderColor: '#0F172A', backgroundColor: '#F1F5F9' },
  organizerHeroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 52, height: 52 },
  logoFallback: { color: '#334155', fontSize: 18, fontWeight: '800' },
  organizerText: { flex: 1, minWidth: 0, gap: 4 },
  organizerName: { fontWeight: '800', color: '#0F172A', fontSize: 15, lineHeight: 20 },
  organizerMetaRow: { gap: 4 },
  organizerMeta: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  organizerMetaMuted: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  ctaBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaBadgeActive: { backgroundColor: '#334155' },
  ctaBadgeText: { fontSize: 12, color: '#FFFFFF', fontWeight: '800' },
  ctaBadgeTextActive: { color: '#FFFFFF' },
  whyBox: {
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  whyLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 },
  whyBody: { fontSize: 13, color: '#334155', lineHeight: 18 },
  upcomingLine: { fontSize: 12, color: '#475569', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagPillText: { fontSize: 11, color: '#3730A3', fontWeight: '700' },
  retryBox: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    padding: 12,
    gap: 8,
  },
  retryText: { fontSize: 13, color: '#7F1D1D', lineHeight: 18 },
  retryBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#B91C1C',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#FFFFFFF2',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#0F172A', fontWeight: '700', fontSize: 15 },
});
