import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalDetail } from '@/lib/api/festivals';
import { getFestival } from '@/lib/api/festivals';
import { formatDateRangeRelative, getRelativeDateLabel } from '@/lib/festival/relativeDate';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

const HERO_H = Platform.OS === 'android' ? 250 : 286;
const GALLERY_H = 120;
const CTA_H = 50;
const DESC_COLLAPSED_LINES = 7;
const SAVE_PENDING_MS = 25000;

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

/** Duration / span label when dates or times are present */
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroBookmark,
        { top, right },
        isBusy && styles.heroBookmarkSaving,
        pressed && !isBusy && styles.heroBookmarkPressed,
        { transform: [{ scale: pressed ? 0.92 : isBusy ? 0.96 : 1 }] },
      ]}
      hitSlop={8}>
      {isBusy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={filled ? 'bookmark' : 'bookmark-outline'} size={22} color="#FFFFFF" />
      )}
    </Pressable>
  );
}

/**
 * Fullscreen image lightbox. Only mount while open so no hidden Modal stays in the native layer.
 * Android hardware back: Modal onRequestClose → same path as backdrop / X (closes lightbox only).
 */
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

export default function FestivalDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [selectedGalleryUri, setSelectedGalleryUri] = useState<string | null>(null);
  const galleryFade = useRef(new Animated.Value(0)).current;
  /** When true, user intends the lightbox open; close completion must not clear if reopened. */
  const lightboxOpenIntentRef = useRef(false);
  /** Bumps on each open/close/blur so stale animation callbacks cannot touch state. */
  const lightboxAnimTokenRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['festival', slug],
    queryFn: () => getFestival(slug ?? ''),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    return () => {
      if (pendingClearTimeoutRef.current) {
        clearTimeout(pendingClearTimeoutRef.current);
      }
    };
  }, []);

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

  const clearSavePending = useCallback((festivalId: string) => {
    saveInFlightRef.current = false;
    if (pendingClearTimeoutRef.current) {
      clearTimeout(pendingClearTimeoutRef.current);
      pendingClearTimeoutRef.current = null;
    }
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(festivalId);
      return next;
    });
  }, []);

  const toggleDescriptionExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDescriptionExpanded((v) => !v);
  };

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
      if (saveInFlightRef.current) {
        if (__DEV__) {
          console.log('[festivo] detail save ignored (in flight)', { slug: festival.slug, festivalId: id });
        }
        return;
      }
      if (__DEV__) {
        console.log('[festivo] detail save pressed', { slug: festival.slug, festivalId: id });
        console.log('[festivo] detail save mutation start', { slug: festival.slug, festivalId: id });
      }
      saveInFlightRef.current = true;
      setPendingIds((prev) => new Set(prev).add(id));
      if (pendingClearTimeoutRef.current) {
        clearTimeout(pendingClearTimeoutRef.current);
      }
      pendingClearTimeoutRef.current = setTimeout(() => {
        if (__DEV__) {
          console.log('[festivo] detail save pending timeout cleanup', { festivalId: id });
        }
        clearSavePending(id);
      }, SAVE_PENDING_MS);

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSavedMutation.mutate(
        {
          festivalId: festival.festivalId,
          slug: festival.slug,
          festival,
        },
        {
          onSettled: () => {
            if (__DEV__) {
              console.log('[festivo] detail save pendingIds cleanup (settled)', { festivalId: id });
            }
            clearSavePending(id);
          },
        },
      );
    },
    [toggleSavedMutation, clearSavePending],
  );

  const bookmarkTop = insets.top + 10;
  const bookmarkRight = 16;

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
        <View style={[styles.heroSkeleton, { height: HERO_H }]} />
        <View style={styles.blockPad}>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          <View style={styles.ctaSkeleton} />
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
  const galleryStrip =
    allGallery.length > 1
      ? allGallery.filter((u) => u !== coverUri)
      : [];

  const dateLineHero = getRelativeDateLabel(data.start_date);
  const dateRangeLine = formatDateRangeRelative(data.start_date, data.end_date);
  const durationLine = quickDurationLabel(data);
  const description = (data.description ?? '').trim();
  const isSaving = pendingIds.has(data.festivalId);
  const primaryLabel = data.saved ? 'Запазено' : 'Запази събитието';

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
        contentContainerStyle={styles.scrollContentBottom}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          {coverUri ? (
            <ExpoImage
              source={{ uri: coverUri }}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition="top"
              transition={200}
              cachePolicy="memory-disk"
              priority="high"
            />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: heroFallbackColor(data.slug) }]} />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.heroTextBlock}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {data.title}
            </Text>
            {data.city || dateLineHero ? (
              <View style={styles.heroMetaBackdrop}>
                {data.city ? (
                  <Text style={styles.heroMetaInBackdrop} numberOfLines={1}>
                    {data.city}
                  </Text>
                ) : null}
                {dateLineHero ? (
                  <Text
                    style={[styles.heroMetaInBackdrop, data.city ? styles.heroMetaInBackdropSecond : null]}
                    numberOfLines={1}>
                    {dateLineHero}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <HeroBookmarkButton
            filled={data.saved}
            isBusy={isSaving}
            onPress={() => onToggleSave(data)}
            top={bookmarkTop}
            right={bookmarkRight}
          />
        </View>

        {/* Primary CTA */}
        <View style={styles.ctaBlock}>
          <Pressable
            onPress={() => onToggleSave(data)}
            style={({ pressed }) => [
              styles.primaryCta,
              {
                opacity: isSaving ? 0.88 : pressed ? 0.9 : 1,
                transform: [
                  { scale: pressed && !isSaving ? 0.97 : isSaving ? 0.985 : 1 },
                ],
              },
            ]}>
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                {data.saved ? (
                  <Ionicons name="bookmark" size={20} color="#FFFFFF" style={styles.ctaIcon} />
                ) : null}
                <Text style={styles.primaryCtaText}>{primaryLabel}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Quick info */}
        <View style={styles.quickInfo}>
          {data.city ? (
            <View style={styles.quickRow}>
              <Text style={styles.quickEmoji} accessibilityLabel="">
                📍
              </Text>
              <Text style={styles.quickText}>{data.city}</Text>
            </View>
          ) : null}
          <View style={styles.quickRow}>
            <Text style={styles.quickEmoji} accessibilityLabel="">
              📅
            </Text>
            <Text style={styles.quickText}>{dateRangeLine || data.start_date}</Text>
          </View>
          {durationLine ? (
            <View style={styles.quickRow}>
              <Text style={styles.quickEmoji} accessibilityLabel="">
                ⏱
              </Text>
              <Text style={styles.quickText}>{durationLine}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {description.length > 0 ? (
          <View style={styles.blockPad}>
            <Text
              style={styles.description}
              numberOfLines={descriptionExpanded ? undefined : DESC_COLLAPSED_LINES}>
              {description}
            </Text>
            {description.length > 320 ? (
              <Pressable onPress={toggleDescriptionExpanded} style={styles.textLinkWrap}>
                <Text style={styles.textLink}>
                  {descriptionExpanded ? 'По-малко' : 'Покажи повече'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Organizer — informational only */}
        {data.organizer_name ? (
          <View style={styles.blockPad}>
            <Text style={styles.sectionLabel}>Организатор</Text>
            <View style={styles.organizerCard}>
              <Text style={styles.organizerName}>{data.organizer_name}</Text>
            </View>
          </View>
        ) : null}

        {/* Gallery — skip duplicate of sole hero */}
        {galleryStrip.length > 0 ? (
          <View style={styles.gallerySection}>
            <Text style={[styles.sectionLabel, styles.galleryHeading]}>Снимки</Text>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScroll}>
              {galleryStrip.map((uri, index) => (
                <Pressable
                  key={`${uri}-${index}`}
                  onPress={() => openGallery(uri)}
                  style={({ pressed }) => [
                    styles.galleryThumbPressable,
                    index < galleryStrip.length - 1 && styles.galleryThumbSep,
                    pressed && styles.galleryThumbPressed,
                  ]}>
                  <ExpoImage
                    source={{ uri }}
                    style={styles.galleryThumbImage}
                    contentFit="cover"
                    transition={160}
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
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
    right: festivalUi.screenPadding + 58,
    bottom: 18,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroMetaBackdrop: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  heroMetaInBackdrop: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '500',
  },
  heroMetaInBackdropSecond: {
    marginTop: 4,
  },
  heroBookmark: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroBookmarkSaving: {
    opacity: 0.85,
  },
  heroBookmarkPressed: {
    opacity: 0.88,
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
  ctaBlock: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 18,
    paddingBottom: 8,
  },
  primaryCta: {
    height: CTA_H,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#111827',
  },
  ctaIcon: {
    marginRight: 8,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  quickInfo: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  quickEmoji: {
    fontSize: 16,
    lineHeight: 22,
  },
  quickText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: festivalUi.colors.text,
    fontWeight: '500',
  },
  blockPad: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  textLinkWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  textLink: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  organizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  organizerName: {
    fontSize: 17,
    fontWeight: '600',
    color: festivalUi.colors.text,
    flex: 1,
  },
  gallerySection: {
    marginTop: 12,
    paddingBottom: 28,
  },
  galleryHeading: {
    paddingHorizontal: festivalUi.screenPadding,
  },
  galleryScroll: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 4,
    gap: 12,
  },
  galleryThumbPressable: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  galleryThumbImage: {
    width: 168,
    height: GALLERY_H,
  },
  galleryThumbSep: {
    marginRight: 12,
  },
  galleryThumbPressed: {
    opacity: 0.88,
  },
  scrollContentBottom: {
    paddingBottom: 40,
  },
  bodyText: {
    fontSize: 17,
    color: festivalUi.colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroSkeleton: {
    width: '100%',
    backgroundColor: '#E5E7EB',
  },
  skeletonLine: {
    height: 14,
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  },
  skeletonLineShort: {
    width: '72%',
  },
  ctaSkeleton: {
    marginTop: 8,
    height: CTA_H,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
});
