import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { festivalUi, OutlinedActionButton } from '@/components/ui/FestivalCard';
import type { FestivalDetail } from '@/lib/api/festivals';
import { getFestival } from '@/lib/api/festivals';
import { formatDateRangeRelative, getRelativeDateLabel } from '@/lib/festival/relativeDate';
import { useToggleSavedMutation } from '@/lib/query/useToggleSavedMutation';

const HERO_H = 286;
const GALLERY_H = 120;
const CTA_H = 50;
const DESC_COLLAPSED_LINES = 7;

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
  disabled,
  isSaving,
  onPress,
  top,
  right,
}: {
  filled: boolean;
  disabled?: boolean;
  isSaving?: boolean;
  onPress: () => void;
  top: number;
  right: number;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroBookmark,
        { top, right },
        disabled && !isSaving && styles.heroBookmarkDisabled,
        isSaving && styles.heroBookmarkSaving,
        pressed && !disabled && styles.heroBookmarkPressed,
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

export default function FestivalDetailScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const insets = useSafeAreaInsets();
  const toggleSavedMutation = useToggleSavedMutation();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['festival', slug],
    queryFn: () => getFestival(slug ?? ''),
    enabled: Boolean(slug),
  });

  const toggleDescriptionExpanded = () => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDescriptionExpanded((v) => !v);
  };

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
              transition={200}
              cachePolicy="memory-disk"
              priority="high"
            />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: heroFallbackColor(data.slug) }]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.82)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle} numberOfLines={3}>
              {data.title}
            </Text>
            {data.city ? (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {data.city}
              </Text>
            ) : null}
            {dateLineHero ? (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {dateLineHero}
              </Text>
            ) : null}
          </View>
          <HeroBookmarkButton
            filled={data.saved}
            disabled={isSaving}
            isSaving={isSaving}
            onPress={() => onToggleSave(data)}
            top={bookmarkTop}
            right={bookmarkRight}
          />
        </View>

        {/* Primary CTA */}
        <View style={styles.ctaBlock}>
          <Pressable
            disabled={isSaving}
            onPress={() => onToggleSave(data)}
            style={({ pressed }) => [
              styles.primaryCta,
              data.saved && styles.primaryCtaSaved,
              pressed && !isSaving && styles.primaryCtaPressed,
              isSaving && styles.primaryCtaSaving,
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

        {/* Organizer */}
        {data.organizer_name ? (
          <View style={styles.blockPad}>
            <Text style={styles.sectionLabel}>Организатор</Text>
            <View style={styles.organizerCard}>
              <Text style={styles.organizerName}>{data.organizer_name}</Text>
              <Ionicons name="chevron-forward" size={18} color={festivalUi.colors.muted} />
            </View>
          </View>
        ) : null}

        {/* Gallery — skip duplicate of sole hero */}
        {galleryStrip.length > 0 ? (
          <View style={styles.gallerySection}>
            <Text style={[styles.sectionLabel, styles.galleryHeading]}>Снимки</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScroll}>
              {galleryStrip.map((uri, index) => (
                <ExpoImage
                  key={`${uri}-${index}`}
                  source={{ uri }}
                  style={[styles.galleryThumb, index < galleryStrip.length - 1 && styles.galleryThumbSep]}
                  contentFit="cover"
                  transition={160}
                  cachePolicy="memory-disk"
                />
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
    right: festivalUi.screenPadding + 52,
    bottom: 18,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  heroMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
  },
  heroBookmark: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroBookmarkDisabled: {
    opacity: 0.45,
  },
  heroBookmarkSaving: {
    opacity: 0.72,
  },
  heroBookmarkPressed: {
    opacity: 0.88,
  },
  ctaBlock: {
    paddingHorizontal: festivalUi.screenPadding,
    paddingTop: 18,
    paddingBottom: 8,
  },
  primaryCta: {
    height: CTA_H,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#111827',
  },
  primaryCtaSaved: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  primaryCtaPressed: {
    opacity: 0.9,
  },
  primaryCtaSaving: {
    opacity: 0.85,
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
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
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
  },
  galleryThumb: {
    width: 168,
    height: GALLERY_H,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  galleryThumbSep: {
    marginRight: 12,
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
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
});
