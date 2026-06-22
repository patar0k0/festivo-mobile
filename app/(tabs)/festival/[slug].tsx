import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FestivalDetailStickyBar } from '@/components/festival/FestivalDetailStickyBar';
import { FestivalMapPreview } from '@/components/festival/FestivalMapPreview';
import { FestivalScheduleSectionList } from '@/components/festival/FestivalScheduleSectionList';
import { VerifiedBadge } from '@/components/organizer/VerifiedBadge';
import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton, skeletonRadii, skeletonRhythm } from '@/components/ui/Skeleton';
import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalDetail, FestivalListItem } from '@/lib/api/festivals';
import { getFestival, getFestivals } from '@/lib/api/festivals';
import { trackEvent } from '@/lib/analytics/track';
import { formatDateRangeRelative } from '@/lib/festival/relativeDate';
import { festivalDetailHref } from '@/lib/navigation/festivalDetailHref';
import { buildLocationQuery, openInMaps } from '@/lib/map/openInMaps';
import { isValidCoordinatePair, looksLikeBulgaria } from '@/lib/map/coordinates';
import { trackRecentlyViewedFestival } from '@/lib/personalization/recentlyViewed';
import { groupFestivalSchedule } from '@/lib/plan/schedule';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';
import { useTogglePlanScheduleItemMutation } from '@/lib/query/useTogglePlanScheduleItemMutation';
import { useToggleLikedMutation } from '@/lib/query/useToggleLikedMutation';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

if (
  Platform.OS === 'android' &&
  (global as typeof globalThis & { nativeFabricUIManager?: unknown }).nativeFabricUIManager == null
) {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const HERO_H = Platform.OS === 'android' ? 268 : 300;
const GALLERY_INITIAL_LIMIT = 4;
const DESC_COLLAPSED_LINES = 6;
const DESC_READ_MORE_MIN_CHARS = 200;
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

function formatDateAbsolute(start: string, end?: string | null): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' });
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return start;
  if (!end?.trim()) return fmt(s);
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return fmt(s);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('bg-BG', { month: 'long', year: 'numeric' })}`;
  }
  return `${fmt(s)} – ${fmt(e)}`;
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

export default function FestivalDetailScreen() {
  const qc = useQueryClient();
  const { slug: slugParam, scheduleDay: scheduleDayParamRaw } = useLocalSearchParams<{
    slug: string;
    scheduleDay?: string;
  }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const scheduleDayParam = Array.isArray(scheduleDayParamRaw)
    ? scheduleDayParamRaw[0]
    : scheduleDayParamRaw;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const toggleLikedMutation = useToggleLikedMutation();
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
    staleTime: 60_000,
    placeholderData: keepPreviousData,
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

  const groupedScheduleDays = useMemo(() => (data ? groupFestivalSchedule(data) : []), [data]);
  const planQuery = useMobilePlanState();
  const toggleScheduleItemMutation = useTogglePlanScheduleItemMutation();

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

  useFocusEffect(
    useCallback(() => {
      if (slug) {
        const q = qc.getQueryState(['festival', slug]);
        const updatedAt = q?.dataUpdatedAt ?? 0;
        if (
          Date.now() - updatedAt > 15_000 &&
          q?.fetchStatus !== 'fetching' &&
          q?.status !== 'pending'
        ) {
          void qc.refetchQueries({ queryKey: ['festival', slug], type: 'active' });
        }
      }
      return () => {
        lightboxAnimTokenRef.current += 1;
        galleryFade.stopAnimation();
        lightboxOpenIntentRef.current = false;
        setGalleryVisible(false);
        setSelectedGalleryUri(null);
        galleryFade.setValue(0);
      };
    }, [galleryFade, qc, slug]),
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

  const onToggleLike = useCallback(
    (festival: FestivalDetail) => {
      if (__DEV__) {
        console.log('[like] tap', {
          slug: festival.slug,
          liked: festival.liked,
          likes_count: festival.likes_count,
        });
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleLikedMutation.mutate({
        festivalId: festival.festivalId,
        slug: festival.slug,
      });
    },
    [toggleLikedMutation],
  );

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

  const scheduleListHeader = (
    <>
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
            <Text style={styles.heroTitle} numberOfLines={3}>
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
          <Pressable
            style={[styles.heroHeart, { top: insets.top + 10 }]}
            onPress={() => onToggleLike(data)}
            disabled={toggleLikedMutation.isPending}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={data.liked ? 'Премахни харесването' : 'Харесай'}>
            {toggleLikedMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.heroHeartInner}>
                <AnimatedHeart
                  filled={data.liked}
                  size={24}
                  color="#EF4444"
                  outlineColor="#FFFFFF"
                />
                {data.likes_count > 0 ? (
                  <Text style={styles.heroHeartCount}>{data.likes_count}</Text>
                ) : null}
              </View>
            )}
          </Pressable>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(260).delay(40)}>
          <FestivalDetailStickyBar
            saved={data.saved}
            saveBusy={isSaving}
            onSave={() => onToggleSave(data)}
          />
        </Reanimated.View>

        <Reanimated.View
          style={styles.quickGrid}
          entering={FadeInDown.duration(260).delay(70)}>
          <QuickTile
            icon="calendar-outline"
            label="Дата"
            value={formatDateAbsolute(data.start_date, data.end_date)}
          />
          {durationLine ? (
            <QuickTile icon="hourglass-outline" label="Продължителност" value={durationLine} />
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
    </>
  );

  const scheduleListFooter = (
    <>
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
                    onPressCard={() => router.push(festivalDetailHref(item.slug))}
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
    </>
  );

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

      {groupedScheduleDays.length > 0 ? (
        <FestivalScheduleSectionList
          detail={data}
          listHeader={scheduleListHeader}
          listFooter={scheduleListFooter}
          contentContainerBottom={insets.bottom + 32}
          initialScheduleDay={scheduleDayParam}
          isScheduleItemPlanned={planQuery.isScheduleItemPlanned}
          toggleScheduleItemMutation={toggleScheduleItemMutation}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContentBottom,
            { paddingBottom: insets.bottom + 32 },
          ]}>
          {scheduleListHeader}
          {scheduleListFooter}
        </ScrollView>
      )}
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
    right: festivalUi.screenPadding + 56,
    bottom: 14,
  },
  heroHeart: {
    position: 'absolute',
    right: 14,
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHeartInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroHeartCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
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
