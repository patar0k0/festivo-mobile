import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { PressableScale } from '@/components/ui/PressableScale';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getRelativeDateLabel, getStartsInLabelBg } from '@/lib/festival/relativeDate';

const colors = {
  text: '#111827',
  secondary: '#6B7280',
  muted: '#9CA3AF',
  border: '#E5E7EB',
  buttonBg: '#7c2d12',
  buttonText: '#FFFFFF',
  buttonOutline: '#D1D5DB',
};

const typography = {
  title: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  sectionTitle: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  secondary: { fontSize: 14, color: colors.secondary },
  muted: { fontSize: 13, color: colors.muted },
};

export const festivalUi = {
  colors,
  typography,
  screenPadding: 16,
  sectionGap: 22,
  cardGap: 14,
};

type FestivalCardProps = {
  item: FestivalListItem;
  onPressCard: () => void;
  onPressSave: () => void;
  /** Wider fixed width for horizontal carousels; compact = light list row (e.g. Saved tab) */
  variant?: 'default' | 'carousel' | 'compact';
  saveDisabled?: boolean;
};

export function FestivalSaveButton({
  label,
  onPress,
  disabled,
  loading,
  floating = false,
  floatingLarge = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  floating?: boolean;
  floatingLarge?: boolean;
  compact?: boolean;
}) {
  const showSpinner = Boolean(loading);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.saveButton,
        compact && styles.saveButtonCompact,
        floating && styles.saveButtonFloating,
        floatingLarge && styles.saveButtonFloatingLarge,
        disabled && !showSpinner && styles.saveButtonDisabled,
        pressed && !disabled && styles.saveButtonPressed,
      ]}>
      {showSpinner ? (
        <ActivityIndicator color={colors.buttonText} size="small" />
      ) : (
        <Text style={styles.saveButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function FestivalCard({
  item,
  onPressCard,
  onPressSave,
  variant = 'default',
  saveDisabled,
}: FestivalCardProps) {
  const saveLabel = item.saved ? 'Премахни' : 'В план';
  const startsInText = getStartsInLabelBg(item.start_date);
  const dateLabel = getRelativeDateLabel(item.start_date);
  const lastSaveTapRef = useRef(0);
  const rawUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;
  const imageUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const handleSavePress = () => {
    const now = Date.now();
    if (now - lastSaveTapRef.current < 280) return;
    lastSaveTapRef.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressSave();
  };

  if (variant === 'compact') {
    return (
      <View style={styles.compactSavedCard}>
        {item.saved ? (
          <View pointerEvents="none" style={styles.compactCardBookmark}>
            <AnimatedBookmark filled size={20} color={colors.text} />
          </View>
        ) : null}
        <PressableScale
          onPress={onPressCard}
          pressedScale={0.99}
          pressedOpacity={0.94}
          style={styles.compactSavedRow}>
          <View style={styles.compactSavedThumbWrap}>
            {imageUrl ? (
              <ExpoImage
                source={{ uri: imageUrl }}
                style={styles.compactSavedThumb}
                contentFit="cover"
                transition={180}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.compactSavedThumbPlaceholder}>
                <Text style={styles.compactSavedThumbEmoji}>🎉</Text>
              </View>
            )}
          </View>
          <View style={[styles.compactSavedBody, item.saved && styles.compactSavedBodyWithBookmark]}>
            <Text style={styles.compactSavedTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.compactSavedMetaFirst} numberOfLines={1}>
              {item.city || 'България'}
            </Text>
            <Text style={styles.compactSavedMetaStatus} numberOfLines={1}>
              {dateLabel}
            </Text>
            <Text style={styles.compactSavedMetaStatusLast} numberOfLines={1}>
              {startsInText}
            </Text>
          </View>
        </PressableScale>
        {item.saved ? (
          <View style={styles.savedCompactStack}>
            <View style={styles.savedBadgeRowCompact}>
              <Text style={styles.savedBadgeLabelCompact}>В плана</Text>
            </View>
            <FestivalSaveButton
              label={saveLabel}
              onPress={handleSavePress}
              disabled={saveDisabled}
              loading={saveDisabled}
              compact
            />
          </View>
        ) : (
          <FestivalSaveButton
            label={saveLabel}
            onPress={handleSavePress}
            disabled={saveDisabled}
            loading={saveDisabled}
            compact
          />
        )}
      </View>
    );
  }

  if (imageUrl) {
    return (
      <PressableScale
        onPress={onPressCard}
        pressedScale={0.97}
        pressedOpacity={0.95}
        style={[
          styles.cardOuter,
          styles.heroCard,
          variant === 'carousel' && styles.cardCarousel,
        ]}>
        <ExpoImage
          source={{ uri: imageUrl }}
          style={styles.heroImage}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.72)']}
          locations={[0, 0.45, 1]}
          style={styles.heroOverlay}
        />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.heroMetaFirst} numberOfLines={1}>
            {item.city}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {startsInText}
          </Text>
        </View>
        <View style={styles.heroCtaWrap}>
          {item.saved ? (
            <View style={styles.heroSavedStack}>
              <View style={styles.savedBadgeRowLight}>
                <AnimatedBookmark filled size={18} color="#FFFFFF" />
                <Text style={styles.savedBadgeLabelLight}>В плана</Text>
              </View>
              <FestivalSaveButton
                label={saveLabel}
                onPress={handleSavePress}
                floating
                disabled={saveDisabled}
                loading={saveDisabled}
              />
              <Text style={styles.heroSavedSub}>Ще получиш напомняне</Text>
            </View>
          ) : (
            <FestivalSaveButton
              label={saveLabel}
              onPress={handleSavePress}
              floating
              disabled={saveDisabled}
              loading={saveDisabled}
            />
          )}
        </View>
      </PressableScale>
    );
  }

  return (
    <View style={[styles.cardOuter, styles.noImageCard, variant === 'carousel' && styles.cardCarousel]}>
      <LinearGradient colors={['#F87171', '#E85D5D', '#B91C1C']} style={StyleSheet.absoluteFill} />
      <View style={styles.noImageEmojiWrap} pointerEvents="none">
        <Text style={styles.noImageEmoji}>🎉</Text>
      </View>
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.25)']}
        style={StyleSheet.absoluteFill}
      />
      <PressableScale
        onPress={onPressCard}
        pressedScale={0.985}
        pressedOpacity={0.94}
        style={[styles.cardInner, styles.noImageInner]}>
        <Text style={styles.noImageTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.noImageCity} numberOfLines={1}>
          {item.city}
        </Text>
        <Text style={styles.noImageDate} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text style={styles.noImageStarts} numberOfLines={1}>
          {startsInText}
        </Text>
      </PressableScale>
      {item.saved ? (
        <View style={styles.savedPlainStack}>
          <View style={styles.savedBadgeRowDark}>
            <AnimatedBookmark filled size={18} color="#FFFFFF" />
            <Text style={styles.savedBadgeLabelOnGradient}>В плана</Text>
          </View>
          <FestivalSaveButton label={saveLabel} onPress={handleSavePress} disabled={saveDisabled} loading={saveDisabled} />
          <Text style={styles.reminderHintLight}>Ще получиш напомняне</Text>
        </View>
      ) : (
        <FestivalSaveButton label={saveLabel} onPress={handleSavePress} disabled={saveDisabled} loading={saveDisabled} />
      )}
    </View>
  );
}

export function FeaturedFestivalCard({
  item,
  onPressCard,
  onPressSave,
  saveDisabled,
}: Omit<FestivalCardProps, 'variant'>) {
  const saveLabel = item.saved ? 'Премахни' : 'В план';
  const startsInText = getStartsInLabelBg(item.start_date);
  const dateLabel = getRelativeDateLabel(item.start_date);
  const lastSaveTapRef = useRef(0);
  const rawUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;
  const imageUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const handleSavePress = () => {
    const now = Date.now();
    if (now - lastSaveTapRef.current < 280) return;
    lastSaveTapRef.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressSave();
  };

  if (!imageUrl) {
    return (
      <FestivalCard
        item={item}
        onPressCard={onPressCard}
        onPressSave={onPressSave}
        saveDisabled={saveDisabled}
      />
    );
  }

  return (
    <PressableScale
      onPress={onPressCard}
      pressedScale={0.97}
      pressedOpacity={0.95}
      style={[styles.cardOuter, styles.featuredCard]}>
      <ExpoImage
        source={{ uri: imageUrl }}
        style={styles.featuredImage}
        contentFit="cover"
        transition={240}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.86)']}
        locations={[0, 0.45, 1]}
        style={styles.featuredOverlay}
      />
      <View style={styles.featuredContent}>
        <Text style={styles.featuredTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.featuredMetaFirst} numberOfLines={1}>
          {item.city}
        </Text>
        <Text style={styles.featuredMeta} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text style={styles.featuredMeta} numberOfLines={1}>
          {startsInText}
        </Text>
      </View>
      <View style={styles.featuredCtaWrap}>
        {item.saved ? (
          <View style={styles.featuredSavedStack}>
            <View style={styles.savedBadgeRowLight}>
              <AnimatedBookmark filled size={18} color="#FFFFFF" />
              <Text style={styles.savedBadgeLabelLight}>В плана</Text>
            </View>
            <FestivalSaveButton
              label={saveLabel}
              onPress={handleSavePress}
              floating
              floatingLarge
              disabled={saveDisabled}
              loading={saveDisabled}
            />
            <Text style={styles.featuredSavedSub}>Ще получиш напомняне</Text>
          </View>
        ) : (
          <FestivalSaveButton
            label={saveLabel}
            onPress={handleSavePress}
            floating
            floatingLarge
            disabled={saveDisabled}
            loading={saveDisabled}
          />
        )}
      </View>
    </PressableScale>
  );
}

/** Section heading for home and similar screens */
export function FestivalSectionTitle({ children }: { children: ReactNode }) {
  return <Text style={[typography.sectionTitle, styles.sectionTitleMargin]}>{children}</Text>;
}

export function OutlinedActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineButton,
        disabled && styles.outlineButtonDisabled,
        pressed && !disabled && styles.outlineButtonPressed,
      ]}>
      <Text style={styles.outlineButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactSavedCard: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  compactCardBookmark: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  compactSavedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 0,
  },
  compactSavedThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  compactSavedThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
  },
  compactSavedThumbPlaceholder: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSavedThumbEmoji: {
    fontSize: 30,
  },
  compactSavedBody: {
    flex: 1,
    minWidth: 0,
  },
  compactSavedBodyWithBookmark: {
    paddingRight: 40,
  },
  compactSavedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  compactSavedMetaFirst: {
    marginTop: 8,
    fontSize: 13,
    color: '#666666',
  },
  compactSavedMetaStatus: {
    marginTop: 10,
    fontSize: 13,
    color: '#777777',
  },
  compactSavedMetaStatusLast: {
    marginTop: 4,
    fontSize: 13,
    color: '#777777',
  },
  savedCompactStack: {
    marginTop: 12,
    gap: 6,
  },
  savedBadgeRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedBadgeLabelCompact: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  cardOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
  noImageCard: {
    padding: 13,
    borderColor: 'rgba(185,28,28,0.35)',
  },
  noImageInner: {
    marginBottom: 12,
  },
  noImageEmojiWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 36,
  },
  noImageEmoji: {
    fontSize: 56,
    opacity: 0.95,
  },
  noImageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  noImageCity: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
  },
  noImageDate: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noImageStarts: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
  },
  heroCard: {
    height: 240,
    padding: 0,
  },
  featuredCard: {
    height: 300,
    padding: 0,
  },
  cardCarousel: {
    width: 272,
    marginRight: 0,
  },
  cardInner: {
    marginBottom: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.06 }],
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  heroContent: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    paddingRight: 132,
  },
  featuredContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    paddingRight: 152,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  heroMetaFirst: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 4,
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },
  featuredMetaFirst: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    marginTop: 6,
  },
  featuredMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    marginTop: 4,
  },
  featuredOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '80%',
  },
  heroCtaWrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    alignItems: 'flex-end',
    maxWidth: '46%',
  },
  heroSavedStack: {
    alignItems: 'flex-end',
    gap: 8,
  },
  savedBadgeRowLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  savedBadgeLabelLight: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  heroSavedSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    textAlign: 'right',
  },
  featuredCtaWrap: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    alignItems: 'flex-end',
    maxWidth: '48%',
  },
  featuredSavedStack: {
    alignItems: 'flex-end',
    gap: 10,
  },
  featuredSavedSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'right',
  },
  city: {
    marginTop: 8,
  },
  date: {
    marginTop: 6,
  },
  startsIn: {
    marginTop: 4,
  },
  saveButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.buttonBg,
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.buttonBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonCompact: {
    minHeight: 40,
    height: 40,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: 14,
  },
  saveButtonFloating: {
    alignSelf: 'flex-end',
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.95)',
    borderColor: 'rgba(17,24,39,0.95)',
    minWidth: 108,
  },
  saveButtonFloatingLarge: {
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 120,
    borderRadius: 999,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonPressed: {
    opacity: 0.88,
  },
  saveButtonText: {
    color: colors.buttonText,
    fontSize: 15,
    fontWeight: '600',
  },
  reminderHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.secondary,
  },
  savedPlainStack: {
    marginTop: 4,
    gap: 10,
  },
  savedBadgeRowDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedBadgeLabelDark: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  savedBadgeLabelOnGradient: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reminderHintLight: {
    marginTop: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  sectionTitleMargin: {
    marginBottom: 14,
  },
  outlineButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.buttonOutline,
    backgroundColor: '#FFFFFF',
  },
  outlineButtonDisabled: {
    opacity: 0.45,
  },
  outlineButtonPressed: {
    opacity: 0.85,
  },
  outlineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
