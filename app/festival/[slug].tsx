import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FestivalDetailStickyBar, FESTIVAL_STICKY_BAR_OFFSET } from '@/components/festival/FestivalDetailStickyBar';
import { FestivalMapPreview } from '@/components/festival/FestivalMapPreview';
import { VerifiedBadge } from '@/components/organizer/VerifiedBadge';
import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton, skeletonRadii, skeletonRhythm } from '@/components/ui/Skeleton';
import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { getFestival, getFestivals } from '@/lib/api/festivals';
import { trackEvent } from '@/lib/analytics/track';
import { formatDateRangeRelative } from '@/lib/festival/relativeDate';
import { buildLocationQuery, openInMaps } from '@/lib/map/openInMaps';
import { isValidCoordinatePair, looksLikeBulgaria } from '@/lib/map/coordinates';
import { trackRecentlyViewedFestival } from '@/lib/personalization/recentlyViewed';
import { groupFestivalSchedule, formatScheduleTime, pickInitialScheduleDayIndex } from '@/lib/plan/schedule';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useTogglePlanScheduleItemMutation } from '@/lib/query/useTogglePlanScheduleItemMutation';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';
import { getFestivalIcsUrl, getFestivalPublicUrl } from '@/lib/site';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const HERO_H = Platform.OS === 'android' ? 268 : 300;
const GALLERY_INITIAL_LIMIT = 4;
const DESC_COLLAPSED_LINES = 6;
const DESC_READ_MORE_MIN_CHARS = 200;
const SCROLL_BOTTOM_EXTRA = 28;

const HERO_PALETTE = ['#4F46E5', '#0EA5E9', '#059669', '#D97706', '#7C3AED', '#DB2777'];

function heroFallbackColor(slug: string): string {
  let sum = 0;
  for (let i = 0; i < slug.length; i += 1) {
    sum += slug.charCodeAt(i) * (i + 1);
  }
  return HERO_PALETTE[Math.abs(sum) % HERO_PALETTE.length];
}

function formatTimeShort(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  }
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return t;
}

function quickDurationLabel(d: FestivalDetail): string | null {
  const { start_date, end_date, start_time, end_time } = d;
  if (!start_date?.trim()) return null;

  const start = new Date(start_date);
  const end = end_date?.trim() ? new Date(end_date) : null;
  if (!Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const dayDiff = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (dayDiff >= 1) {
      return `${dayDiff + 1} дни`;
    }
  }

  if (start_time && end_time) {
    const a = formatTimeShort(start_time);
    const b = formatTimeShort(end_time);
    if (a && b) return `${a} – ${b}`;
  }

  return null;
}

function HeroBookmarkButton({
  filled,
  isBusy,
  onPress,
  top,
  right,
}: {
  filled: boolean;
  isBusy?: boolean;
  onPress: () => void;
  top: number;
  right: number;
}) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.92}
      style={[styles.heroBookmark, { top, right }, isBusy && styles.heroBookmarkSaving]}
      hitSlop={8}>
      {isBusy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <AnimatedBookmark filled={filled} size={22} color="#FFFFFF" />
      )}
    </PressableScale>
  );
}

function GalleryLightbox({
  uri,
  onClose,
  insetTop,
  fadeAnim,
}: {
  uri: string;
  onClose: () => void;
  insetTop: number;
  fadeAnim: Animated.Value;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Animated.View style={[styles.lightboxRoot, { opacity: fadeAnim }]} pointerEvents="box-none">
        <Pressable
          style={styles.lightboxBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Затвори"
        />
        <View style={styles.lightboxContent} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            style={[styles.lightboxClose, { top: insetTop + 10 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Затвори">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          <ExpoImage
            source={{ uri }}
            style={styles.lightboxImage}
            contentFit="contain"
            transition={200}
            cachePolicy="memory-disk"
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const MetaChip = memo(function MetaChip({
  icon,
  label,
  dark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  dark?: boolean;
}) {
  return (
    <View style={[styles.metaChip, dark && styles.metaChipDark]}>
      <Ionicons name={icon} size={14} color={dark ? 'rgba(255,255,255,0.95)' : festivalUi.colors.text} />
      <Text style={[styles.metaChipText, dark && styles.metaChipTextDark]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const RelatedMiniCard = memo(function RelatedMiniCard({
  item,
  saving,
  onPressCard,
  onPressSave,
}: {
  item: FestivalListItem;
  saving: boolean;
  onPressCard: () => void;
  onPressSave: () => void;
}) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const dateLabel = formatDateRangeRelative(item.start_date, item.end_date);
  return (
    <PressableScale onPress={onPressCard} pressedScale={0.985} pressedOpacity={0.92} style={styles.relatedMiniCard}>
      <View style={styles.relatedMiniThumb}>
        {uri ? (
          <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />
        ) : (
          <View style={styles.relatedMiniThumbFallback}>
            <Text style={styles.relatedMiniThumbEmoji}>🎉</Text>
          </View>
        )}
      </View>
      <View style={styles.relatedMiniBody}>
        <Text style={styles.relatedMiniTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.relatedMiniMeta} numberOfLines={1}>
          {item.city || 'България'} · {dateLabel}
        </Text>
      </View>
      <Pressable
        onPress={onPressSave}
        hitSlop={10}
        disabled={saving}
        style={({ pressed }) => [styles.relatedSaveBtn, pressed && !saving && styles.relatedSaveBtnPressed, saving && styles.relatedSaveBtnSaving]}>
        {saving ? <ActivityIndicator size="small" color={festivalUi.colors.text} /> : <AnimatedBookmark filled={item.saved} size={20} color={item.saved ? festivalUi.colors.text : festivalUi.colors.secondary} />}
      </Pressable>
    </PressableScale>
  );
});

const QuickTile = memo(function QuickTile({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.quickTile}>
      <View style={styles.quickTileIcon}>
        <Ionicons name={icon} size={18} color={festivalUi.colors.text} />
      </View>
      <Text style={styles.quickTileLabel}>{label}</Text>
      <Text style={styles.quickTileValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
});

const ScheduleTimelineSection = memo(function ScheduleTimelineSection({ detail }: { detail: FestivalDetail }) {
  const groupedDays = useMemo(() => groupFestivalSchedule(detail), [detail]);
  const initialDayIndex = useMemo(() => pickInitialScheduleDayIndex(groupedDays), [groupedDays]);
  const [activeDayIndex, setActiveDayIndex] = useState(initialDayIndex);
  const planQuery = useMobilePlanState();
  const toggleScheduleItemMutation = useTogglePlanScheduleItemMutation();
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setActiveDayIndex(initialDayIndex);
  }, [initialDayIndex]);

  const activeDay = groupedDays[Math.min(activeDayIndex, Math.max(0, groupedDays.length - 1))];
  const plannedInFestival = useMemo(() => {
    if (!groupedDays.length) return 0;
    return groupedDays.reduce(
      (count, day) => count + day.items.filter((item) => planQuery.isScheduleItemPlanned(item.id)).length,
      0,
    );
  }, [groupedDays, planQuery]);

  if (!groupedDays.length || !activeDay) return null;

  return (
    <Reanimated.View style={styles.scheduleSection} entering={FadeInDown.duration(260).delay(180)}>
      <View style={styles.scheduleHeaderRow}>
        <View>
          <Text style={styles.sectionHeading}>Програма</Text>
          <Text style={styles.scheduleHint}>
            {plannedInFestival > 0
              ? `${plannedInFestival} точки са в плана ти`
              : 'Добавяй отделни точки към личния си план.'}
          </Text>
        </View>
        <View style={styles.scheduleCountPill}>
          <Ionicons name="list-outline" size={14} color="#4F46E5" />
          <Text style={styles.scheduleCountText}>{detail.schedule_items?.length ?? 0}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daySelector}
        keyboardShouldPersistTaps="handled">
        {groupedDays.map((day, index) => {
          const active = index === activeDayIndex;
          const plannedCount = day.items.filter((item) => planQuery.isScheduleItemPlanned(item.id)).length;
          return (
            <Pressable
              key={day.id}
              onPress={() => {
                setActiveDayIndex(index);
                void Haptics.selectionAsync();
              }}
              style={({ pressed }) => [
                styles.dayChip,
                active && styles.dayChipActive,
                pressed && styles.dayChipPressed,
              ]}>
              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]} numberOfLines={1}>
                {day.label}
              </Text>
              {plannedCount > 0 ? (
                <View style={styles.dayPlannedDot}>
                  <Text style={styles.dayPlannedText}>{plannedCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.timelineList}>
        {activeDay.items.map((item) => {
          const planned = planQuery.isScheduleItemPlanned(item.id);
          const pending = pendingItemIds.has(item.id);
          return (
            <View key={item.id} style={[styles.timelineCard, planned && styles.timelineCardPlanned]}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, planned && styles.timelineDotPlanned]} />
                <View style={styles.timelineLine} />
              </View>
              <View style={styles.timelineCardBody}>
                <Text style={styles.timelineMeta} numberOfLines={1}>
                  {formatScheduleTime(item.start_time, item.end_time)}
                  {item.stage ? ` · ${item.stage}` : ''}
                </Text>
                <Text style={styles.timelineTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={styles.timelineDescription} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Pressable
                disabled={pending}
                onPress={() => {
                  setPendingItemIds((prev) => new Set(prev).add(item.id));
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleScheduleItemMutation.mutate(
                    { scheduleItemId: item.id },
                    {
                      onSettled: () => {
                        setPendingItemIds((prev) => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      },
                    },
                  );
                }}
                style={({ pressed }) => [
                  styles.timelinePlanButton,
                  planned && styles.timelinePlanButtonActive,
                  (pressed || pending) && styles.timelinePlanButtonPressed,
                ]}>
                {pending ? (
                  <ActivityIndicator size="small" color={planned ? '#FFFFFF' : festivalUi.colors.text} />
                ) : (
                  <>
                    <Ionicons
                      name={planned ? 'checkmark' : 'add'}
                      size={17}
                      color={planned ? '#FFFFFF' : festivalUi.colors.text}
                    />
                    <Text style={[styles.timelinePlanText, planned && styles.timelinePlanTextActive]}>
                      {planned ? 'В плана' : 'План'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </Reanimated.View>
  );
});

export default function FestivalDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [selectedGalleryUri, setSelectedGalleryUri] = useState<string | null>(null);
  const galleryFade = useRef(new Animated.Value(0)).current;
  const lightboxOpenIntentRef = useRef(false);
  const lightboxAnimTokenRef = useRef(0);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['festival', slug],
    queryFn: () => getFestival(slug ?? ''),
    enabled: Boolean(slug),
  });

  const { data: relatedRaw } = useQuery({
    queryKey: ['festivals', 'trending', 'related', slug],
    queryFn: () => getFestivals({ sort: 'trending', limit: 28 }),
    enabled: Boolean(slug && data),
    staleTime: 60_000,
  });

  const relatedList = useMemo(() => {
    if (!relatedRaw || !data) return [];
    return relatedRaw.filter((x) => x.slug !== data.slug).slice(0, 12);
  }, [relatedRaw, data]);

  useEffect(() => {
    if (!data) return;
    const viewedItem: FestivalListItem = {
      festivalId: data.festivalId,
      slug: data.slug,
      title: data.title,
      city: data.city,
      start_date: data.start_date,
      end_date: data.end_date,
      image_url: data.image_url ?? null,
      saved: data.saved,
      organizer_name: data.organizer_name,
      category: data.category,
      is_verified: data.is_verified,
      is_promoted: data.is_promoted,
    };
    void trackRecentlyViewedFestival(viewedItem);
    void trackEvent({
      event: 'festival_view',
      festival_id: data.festivalId,
      slug: data.slug,
      source: 'mobile_detail',
    });
  }, [data]);

  const stickyBottomReserve = FESTIVAL_STICKY_BAR_OFFSET + Math.max(insets.bottom, 10) + SCROLL_BOTTOM_EXTRA;

  useFocusEffect(
    useCallback(() => {
      return () => {
        lightboxAnimTokenRef.current += 1;
        galleryFade.stopAnimation();
        lightboxOpenIntentRef.current = false;
        setGalleryVisible(false);
        setSelectedGalleryUri(null);
        galleryFade.setValue(0);
      };
    }, [galleryFade]),
  );

  const toggleDescriptionExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDescriptionExpanded((v) => !v);
  }, []);

  const openGallery = useCallback(
    (uri: string) => {
      lightboxOpenIntentRef.current = true;
      const token = ++lightboxAnimTokenRef.current;
      galleryFade.stopAnimation();
      setSelectedGalleryUri(uri);
      setGalleryVisible(true);
      galleryFade.setValue(0);
      Animated.timing(galleryFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        if (token !== lightboxAnimTokenRef.current || !lightboxOpenIntentRef.current) {
          return;
        }
      });
    },
    [galleryFade],
  );

  const closeGallery = useCallback(() => {
    lightboxOpenIntentRef.current = false;
    const token = ++lightboxAnimTokenRef.current;
    galleryFade.stopAnimation();
    Animated.timing(galleryFade, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      if (token !== lightboxAnimTokenRef.current) {
        return;
      }
      if (lightboxOpenIntentRef.current) {
        return;
      }
      setGalleryVisible(false);
      setSelectedGalleryUri(null);
      galleryFade.setValue(0);
    });
  }, [galleryFade]);

  const onToggleSave = useCallback(
    (festival: FestivalDetail) => {
      const id = festival.festivalId;
      setPendingIds((prev) => new Set(prev).add(id));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSavedMutation.mutate(
        {
          festivalId: festival.festivalId,
          slug: festival.slug,
          festival,
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

  const bookmarkTop = insets.top + 10;
  const bookmarkRight = 14;

  const handleShare = useCallback(() => {
    if (!data) return;
    const url = getFestivalPublicUrl(data.slug);
    const line1 = data.title.trim();
    if (!url) {
      Alert.alert('Споделяне', 'Липсва адрес на сайта. Задай EXPO_PUBLIC_SITE_URL или EXPO_PUBLIC_API_URL.');
      return;
    }
    void Share.share({ message: `${line1}\n${url}` });
  }, [data]);

  const mapsQueryFromDetail = useCallback((d: FestivalDetail) => {
    return buildLocationQuery([
      d.location?.location_name,
      d.location?.address,
      d.city,
      d.title,
    ]);
  }, []);

  const handleOpenMaps = useCallback(() => {
    if (!data) return;
    const lat = data.location?.lat ?? null;
    const lng = data.location?.lng ?? null;
    openInMaps({
      latitude: lat,
      longitude: lng,
      queryFallback: mapsQueryFromDetail(data),
    });
  }, [data, mapsQueryFromDetail]);

  const handleCalendar = useCallback(async () => {
    if (!data) return;
    const ics = getFestivalIcsUrl(data.slug);
    if (!ics) {
      Alert.alert('Календар', 'Не можем да отворим календарния линк. Провери EXPO_PUBLIC_SITE_URL.');
      return;
    }
    void Haptics.selectionAsync();
    try {
      await Linking.openURL(ics);
    } catch {
      void Share.share({ message: `${data.title}\n${ics}` });
    }
  }, [data]);

  if (!slug) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.bodyText}>Липсва фестивал</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContentBottom}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Skeleton width={'100%'} height={HERO_H} radius={0} />
        <View style={styles.blockPad}>
          <Skeleton height={skeletonRhythm.lineLg} width={'100%'} style={styles.skeletonLineSpace} />
          <Skeleton height={skeletonRhythm.lineLg} width={'72%'} style={styles.skeletonLineSpace} />
          <Skeleton height={120} width={'100%'} radius={skeletonRadii.card} style={styles.skeletonLineSpace} />
        </View>
      </ScrollView>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.bodyText}>Нещо се обърка</Text>
        <OutlinedActionButton label="Опитай пак" onPress={() => refetch()} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.bodyText}>Няма данни за това събитие.</Text>
      </View>
    );
  }

  const coverUri =
    typeof data.image_url === 'string' && data.image_url.trim() ? data.image_url.trim() : undefined;
  const allGallery = data.gallery_urls ?? [];
  const galleryStrip = allGallery.length > 1 ? allGallery.filter((u) => u !== coverUri) : allGallery.length ? allGallery : [];
  const galleryPreview = galleryStrip.slice(0, GALLERY_INITIAL_LIMIT);
  const hasMoreGallery = galleryStrip.length > GALLERY_INITIAL_LIMIT;

  const dateRangeLine = formatDateRangeRelative(data.start_date, data.end_date);
  const durationLine = quickDurationLabel(data);
  const description = (data.description ?? '').trim();
  const isSaving = pendingIds.has(data.festivalId);
  const organizerSlug = data.organizer?.slug?.trim();
  const organizerName = data.organizer?.name?.trim() || data.organizer_name?.trim() || '';
  const hasOrganizerProfile = Boolean(organizerSlug);

  const lat = data.location?.lat ?? null;
  const lng = data.location?.lng ?? null;
  const hasMapCoords =
    lat != null &&
    lng != null &&
    isValidCoordinatePair(lat, lng) &&
    looksLikeBulgaria(lat, lng);

  const mapAddressLine = buildLocationQuery([
    data.location?.location_name,
    data.location?.address,
    data.city,
  ]);

  const showReadMore = description.length >= DESC_READ_MORE_MIN_CHARS;

  const categoryLabel = data.category?.trim();
  const tagPreview = data.tags?.slice(0, 2).join(' · ');

  return (
    <View style={styles.root}>
      {galleryVisible && selectedGalleryUri ? (
        <GalleryLightbox
          uri={selectedGalleryUri}
          onClose={closeGallery}
          insetTop={insets.top}
          fadeAnim={galleryFade}
        />
      ) : null}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContentBottom, { paddingBottom: stickyBottomReserve }]}>
        <Reanimated.View style={styles.heroWrap} entering={FadeIn.duration(220)}>
          {coverUri ? (
            <ExpoImage
              source={{ uri: coverUri }}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition={{ top: 0.32 }}
              transition={260}
              cachePolicy="memory-disk"
              priority="high"
            />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: heroFallbackColor(data.slug) }]} />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.34)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.92)']}
            locations={[0, 0.32, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[styles.heroTextBlock, { bottom: 14 }]}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {data.title}
            </Text>
            <View style={styles.heroChips}>
              {data.city ? <MetaChip icon="location-outline" label={data.city} dark /> : null}
              {dateRangeLine ? <MetaChip icon="calendar-outline" label={dateRangeLine} dark /> : null}
              {categoryLabel ? <MetaChip icon="pricetag-outline" label={categoryLabel} dark /> : null}
              {data.is_verified ? (
                <View style={styles.verifyChip}>
                  <Ionicons name="shield-checkmark" size={14} color="#A7F3D0" />
                  <Text style={styles.verifyChipText}>Проверено</Text>
                </View>
              ) : null}
              {data.is_promoted ? (
                <View style={styles.trendChip}>
                  <Ionicons name="flame-outline" size={14} color="#FDE68A" />
                  <Text style={styles.trendChipText}>Актуално</Text>
                </View>
              ) : null}
            </View>
          </View>
          <HeroBookmarkButton
            filled={data.saved}
            isBusy={isSaving}
            onPress={() => onToggleSave(data)}
            top={bookmarkTop}
            right={bookmarkRight}
          />
        </Reanimated.View>

        <Reanimated.View
          style={styles.quickGrid}
          entering={FadeInDown.duration(260).delay(40)}>
          {data.city ? <QuickTile icon="location-outline" label="Локация" value={data.city} /> : null}
          <QuickTile
            icon="calendar-outline"
            label="Дата"
            value={dateRangeLine || data.start_date}
          />
          {durationLine ? <QuickTile icon="hourglass-outline" label="Продължителност" value={durationLine} /> : null}
          {organizerName ? (
            <QuickTile icon="people-outline" label="Организатор" value={organizerName} />
          ) : null}
          {categoryLabel ? (
            <QuickTile icon="sparkles-outline" label="Категория" value={categoryLabel} />
          ) : null}
        </Reanimated.View>

        {description.length > 0 ? (
          <Reanimated.View
            style={styles.blockPad}
            entering={FadeInDown.duration(260).delay(110)}>
            <Text style={styles.sectionHeading}>Описание</Text>
            <Text
              style={styles.description}
              numberOfLines={descriptionExpanded ? undefined : DESC_COLLAPSED_LINES}>
              {description}
            </Text>
            {showReadMore ? (
              <Pressable onPress={toggleDescriptionExpanded} style={styles.textLinkWrap}>
                <Text style={styles.textLink}>
                  {descriptionExpanded ? 'Свий' : 'Прочети още'}
                </Text>
              </Pressable>
            ) : null}
          </Reanimated.View>
        ) : null}

        <ScheduleTimelineSection detail={data} />

        {organizerName ? (
          <Reanimated.View
            style={styles.blockPad}
            entering={FadeInDown.duration(260).delay(160)}>
            <Text style={styles.sectionHeading}>Организатор</Text>
            {hasOrganizerProfile && organizerSlug ? (
              <PressableScale
                onPress={() => router.push(`/organizer/${organizerSlug}`)}
                pressedScale={0.99}
                pressedOpacity={0.9}
                style={styles.organizerCard}>
                <View style={styles.orgAvatar}>
                  {data.organizer?.logo_url ? (
                    <ExpoImage
                      source={{ uri: data.organizer.logo_url }}
                      style={styles.orgAvatarImg}
                      contentFit="cover"
                      transition={180}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Ionicons name="business-outline" size={22} color={festivalUi.colors.secondary} />
                  )}
                </View>
                <View style={styles.orgBody}>
                  <View style={styles.orgTitleRow}>
                    <Text style={styles.organizerName} numberOfLines={2}>
                      {organizerName}
                    </Text>
                    {data.organizer?.verified ? <VerifiedBadge compact /> : null}
                  </View>
                  <Text style={styles.orgSubtitle}>Организатор</Text>
                  {tagPreview ? (
                    <Text style={styles.orgHint} numberOfLines={1}>
                      {tagPreview}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={festivalUi.colors.secondary} />
              </PressableScale>
            ) : (
              <View style={styles.organizerCard}>
                <View style={styles.orgAvatar}>
                  <Ionicons name="business-outline" size={22} color={festivalUi.colors.secondary} />
                </View>
                <View style={styles.orgBody}>
                  <Text style={styles.organizerName}>{organizerName}</Text>
                  <Text style={styles.orgSubtitle}>Организатор</Text>
                </View>
              </View>
            )}
          </Reanimated.View>
        ) : null}

        {hasMapCoords ? (
          <Reanimated.View entering={FadeInDown.duration(260).delay(200)}>
            <FestivalMapPreview
              latitude={lat!}
              longitude={lng!}
              title={data.title}
              addressLine={mapAddressLine}
              onOpenMaps={handleOpenMaps}
            />
          </Reanimated.View>
        ) : null}

        {galleryStrip.length > 0 ? (
          <Reanimated.View
            style={styles.gallerySection}
            entering={FadeInDown.duration(260).delay(240)}>
            <Text style={[styles.sectionHeading, styles.galleryHeading]}>Галерия</Text>
            <View style={styles.galleryGrid}>
              {galleryPreview.map((uri, index) => (
                <Pressable
                  key={`${uri}-${index}`}
                  onPress={() => openGallery(uri)}
                  style={({ pressed }) => [styles.gridThumbWrap, pressed && styles.gridThumbPressed]}>
                  <ExpoImage
                    source={{ uri }}
                    style={styles.gridThumb}
                    contentFit="cover"
                    transition={180}
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
            </View>
            {hasMoreGallery ? (
              <Pressable onPress={() => openGallery(galleryStrip[0])} style={styles.galleryCta}>
                <Text style={styles.galleryCtaText}>Виж всички снимки</Text>
                <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
              </Pressable>
            ) : null}
          </Reanimated.View>
        ) : null}

        {relatedList.length > 0 ? (
          <Reanimated.View
            style={styles.relatedSection}
            entering={FadeInDown.duration(260).delay(280)}>
            <Text style={styles.sectionHeading}>Още фестивали</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedScroll}
              keyboardShouldPersistTaps="handled">
              {relatedList.map((item) => (
                <View key={item.festivalId} style={styles.relatedCardWrap}>
                  <RelatedMiniCard
                    item={item}
                    saving={pendingIds.has(item.festivalId)}
                    onPressCard={() => router.push(`/festival/${item.slug}`)}
                    onPressSave={() => {
                      setPendingIds((prev) => new Set(prev).add(item.festivalId));
                      toggleSavedMutation.mutate(
                        { festivalId: item.festivalId, slug: item.slug, festival: item },
                        {
                          onSettled: () => {
                            setPendingIds((prev) => {
                              const n = new Set(prev);
                              n.delete(item.festivalId);
                              return n;
                            });
                          },
                        },
                      );
                    }}
                  />
                </View>
              ))}
            </ScrollView>
          </Reanimated.View>
        ) : null}
      </ScrollView>

      <FestivalDetailStickyBar
        saved={data.saved}
        saveBusy={isSaving}
        onSave={() => onToggleSave(data)}
        onShare={handleShare}
        onMaps={handleOpenMaps}
        onCalendar={handleCalendar}
        calendarDisabled={!getFestivalIcsUrl(data.slug)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerFill: {
    flex: 1,
    padding: festivalUi.screenPadding,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroWrap: {
    width: '100%',
    height: HERO_H,
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
  },
  heroTextBlock: {
    position: 'absolute',
    left: festivalUi.screenPadding,
    right: festivalUi.screenPadding + 48,
    bottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    marginBottom: 10,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    maxWidth: '100%',
  },
  metaChipDark: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: festivalUi.colors.text,
    maxWidth: 220,
  },
  metaChipTextDark: {
    color: 'rgba(255,255,255,0.96)',
  },
  scheduleSection: {
    marginHorizontal: festivalUi.screenPadding,
    marginTop: 8,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleHint: {
    marginTop: 4,
    fontSize: 13,
    color: festivalUi.colors.secondary,
    lineHeight: 18,
  },
  scheduleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scheduleCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  daySelector: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 10,
  },
  dayChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dayChipActive: {
    borderColor: festivalUi.colors.text,
    backgroundColor: festivalUi.colors.text,
  },
  dayChipPressed: {
    opacity: 0.78,
  },
  dayChipText: {
    maxWidth: 160,
    fontSize: 13,
    fontWeight: '700',
    color: festivalUi.colors.text,
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  dayPlannedDot: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
  },
  dayPlannedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  timelineList: {
    gap: 10,
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingRight: 10,
  },
  timelineCardPlanned: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  timelineRail: {
    width: 30,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginTop: 5,
  },
  timelineDotPlanned: {
    backgroundColor: '#16A34A',
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginTop: 5,
  },
  timelineCardBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  timelineMeta: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
  },
  timelineTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: festivalUi.colors.text,
    lineHeight: 20,
  },
  timelineDescription: {
    marginTop: 5,
    fontSize: 13,
    color: festivalUi.colors.secondary,
    lineHeight: 18,
  },
  timelinePlanButton: {
    minWidth: 70,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  timelinePlanButtonActive: {
    borderColor: '#16A34A',
    backgroundColor: '#16A34A',
  },
  timelinePlanButtonPressed: {
    opacity: 0.72,
  },
  timelinePlanText: {
    fontSize: 12,
    fontWeight: '800',
    color: festivalUi.colors.text,
  },
  timelinePlanTextActive: {
    color: '#FFFFFF',
  },
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(167,243,208,0.45)',
  },
  verifyChipText: { fontSize: 12, fontWeight: '600', color: '#ECFDF5' },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.4)',
  },
  trendChipText: { fontSize: 12, fontWeight: '600', color: '#FFFBEB' },
  heroBookmark: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroBookmarkSaving: {
    opacity: 0.85,
  },
  heroBookmarkPressed: {
    opacity: 0.88,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: festivalUi.screenPadding - 4,
    paddingTop: 12,
    gap: 10,
  },
  quickTile: {
    width: '47%',
    flexGrow: 1,
    minWidth: '42%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    padding: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  quickTileIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickTileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    marginBottom: 4,
  },
  quickTileValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: festivalUi.colors.text,
    marginBottom: 8,
  },
  lightboxRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  lightboxClose: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    elevation: Platform.OS === 'android' ? 8 : 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  lightboxImage: {
    width: '100%',
    height: '78%',
    maxHeight: 640,
  },
  blockPad: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 20,
  },
  description: {
    fontSize: 16,
    lineHeight: 27,
    color: '#374151',
  },
  textLinkWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  textLink: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  organizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    gap: 12,
  },
  orgAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orgAvatarImg: { width: '100%', height: '100%' },
  orgBody: { flex: 1, minWidth: 0 },
  orgTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '700',
    color: festivalUi.colors.text,
    flexShrink: 1,
  },
  orgSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  orgHint: {
    marginTop: 4,
    fontSize: 13,
    color: festivalUi.colors.muted,
    fontWeight: '500',
  },
  gallerySection: {
    marginTop: 4,
    paddingBottom: 8,
  },
  galleryHeading: {
    paddingHorizontal: festivalUi.screenPadding,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: festivalUi.screenPadding,
    gap: 10,
    marginTop: 4,
  },
  gridThumbWrap: {
    width: '48%',
    aspectRatio: 1.04,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  gridThumbPressed: {
    opacity: 0.88,
  },
  relatedSection: {
    marginTop: 6,
    paddingBottom: 20,
  },
  relatedScroll: {
    paddingHorizontal: festivalUi.screenPadding,
    gap: 10,
    paddingTop: 4,
  },
  relatedCardWrap: {
    width: 246,
  },
  relatedMiniCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  relatedMiniThumb: {
    width: '100%',
    height: 126,
    backgroundColor: '#F3F4F6',
  },
  relatedMiniThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedMiniThumbEmoji: {
    fontSize: 32,
  },
  relatedMiniBody: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 4,
  },
  relatedMiniTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  relatedMiniMeta: {
    fontSize: 12,
    color: festivalUi.colors.secondary,
  },
  relatedSaveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedSaveBtnPressed: {
    opacity: 0.82,
  },
  relatedSaveBtnSaving: {
    opacity: 0.64,
  },
  galleryCta: {
    marginTop: 10,
    marginHorizontal: festivalUi.screenPadding,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.22)',
    backgroundColor: 'rgba(79,70,229,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  galleryCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
  },
  scrollContentBottom: {
    paddingBottom: 32,
  },
  bodyText: {
    fontSize: 17,
    color: festivalUi.colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  skeletonLineSpace: {
    marginBottom: 10,
  },
});
