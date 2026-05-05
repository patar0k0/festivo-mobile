import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FestivalListItem } from '@/lib/api/festivals';
import { getRelativeDateLabel, getStartsInLabelBg } from '@/lib/festival/relativeDate';

const colors = {
  text: '#111827',
  secondary: '#6B7280',
  muted: '#9CA3AF',
  border: '#E5E7EB',
  buttonBg: '#111827',
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
  /** Wider fixed width for horizontal carousels */
  variant?: 'default' | 'carousel';
  saveDisabled?: boolean;
};

export function FestivalSaveButton({
  label,
  onPress,
  disabled,
  loading,
  floating = false,
  floatingLarge = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  floating?: boolean;
  floatingLarge?: boolean;
}) {
  const showSpinner = Boolean(loading);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.saveButton,
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
  const saveLabel = item.saved ? 'Премахни' : 'Запази';
  const startsInText = getStartsInLabelBg(item.start_date);
  const dateLabel = getRelativeDateLabel(item.start_date);
  const lastSaveTapRef = useRef(0);
  const rawUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;
  const imageUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const handleSavePress = () => {
    const now = Date.now();
    if (now - lastSaveTapRef.current < 500) return;
    lastSaveTapRef.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressSave();
  };

  if (imageUrl) {
    return (
      <Pressable
        onPress={onPressCard}
        style={({ pressed }) => [
          styles.cardOuter,
          styles.heroCard,
          variant === 'carousel' && styles.cardCarousel,
          pressed && styles.cardPressed,
        ]}>
        <Image source={{ uri: imageUrl }} style={styles.heroImage} />
        <LinearGradient
          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.72)']}
          locations={[0, 0.45, 1]}
          style={styles.heroOverlay}
        />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
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
                <Ionicons name="bookmark" size={18} color="#FFFFFF" />
                <Text style={styles.savedBadgeLabelLight}>Запазено</Text>
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
      </Pressable>
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
      <Pressable onPress={onPressCard} style={({ pressed }) => [styles.cardInner, styles.noImageInner, pressed && styles.cardPressed]}>
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
      </Pressable>
      {item.saved ? (
        <View style={styles.savedPlainStack}>
          <View style={styles.savedBadgeRowDark}>
            <Ionicons name="bookmark" size={18} color="#FFFFFF" />
            <Text style={styles.savedBadgeLabelOnGradient}>Запазено</Text>
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
  const saveLabel = item.saved ? 'Премахни' : 'Запази';
  const startsInText = getStartsInLabelBg(item.start_date);
  const dateLabel = getRelativeDateLabel(item.start_date);
  const lastSaveTapRef = useRef(0);
  const rawUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;
  const imageUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const handleSavePress = () => {
    const now = Date.now();
    if (now - lastSaveTapRef.current < 500) return;
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
    <Pressable onPress={onPressCard} style={({ pressed }) => [styles.cardOuter, styles.featuredCard, pressed && styles.cardPressed]}>
      <Image source={{ uri: imageUrl }} style={styles.featuredImage} />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.86)']}
        locations={[0, 0.45, 1]}
        style={styles.featuredOverlay}
      />
      <View style={styles.featuredContent}>
        <Text style={styles.featuredTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.featuredMeta} numberOfLines={1}>
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
              <Ionicons name="bookmark" size={18} color="#FFFFFF" />
              <Text style={styles.savedBadgeLabelLight}>Запазено</Text>
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
    </Pressable>
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
  heroMeta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 4,
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },
  featuredMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    marginTop: 6,
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
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
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.buttonBg,
    alignItems: 'center',
  },
  saveButtonFloating: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.95)',
    borderColor: 'rgba(17,24,39,0.95)',
    minWidth: 108,
  },
  saveButtonFloatingLarge: {
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
    marginBottom: 12,
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
