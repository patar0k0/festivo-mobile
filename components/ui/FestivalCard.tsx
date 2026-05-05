import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { FestivalListItem } from '@/lib/api/festivals';

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
};

function getStartsInText(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.ceil((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays <= 0) return 'Started';
  if (diffDays === 1) return 'Starts in 1 day';
  return `Starts in ${diffDays} days`;
}

export function FestivalSaveButton({
  label,
  onPress,
  disabled,
  floating = false,
  floatingLarge = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  floating?: boolean;
  floatingLarge?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.saveButton,
        floating && styles.saveButtonFloating,
        floatingLarge && styles.saveButtonFloatingLarge,
        disabled && styles.saveButtonDisabled,
        pressed && !disabled && styles.saveButtonPressed,
      ]}>
      <Text style={styles.saveButtonText}>{label}</Text>
    </Pressable>
  );
}

export function FestivalCard({ item, onPressCard, onPressSave, variant = 'default' }: FestivalCardProps) {
  const saveLabel = item.saved ? 'Reminder set' : 'Remind me';
  const startsInText = getStartsInText(item.start_date);
  const imageUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;

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
            {item.start_date}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {startsInText}
          </Text>
        </View>
        <View style={styles.heroCtaWrap}>
          <FestivalSaveButton label={saveLabel} onPress={onPressSave} floating />
        </View>
        {item.saved ? <Text style={styles.heroReminderHint}>You'll get notified before it starts</Text> : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.cardOuter, variant === 'carousel' && styles.cardCarousel]}>
      <Pressable onPress={onPressCard} style={({ pressed }) => [styles.cardInner, pressed && styles.cardPressed]}>
        <Text style={typography.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[typography.secondary, styles.city]} numberOfLines={1}>
          {item.city}
        </Text>
        <Text style={[typography.muted, styles.date]} numberOfLines={1}>
          {item.start_date}
        </Text>
        <Text style={[typography.muted, styles.startsIn]} numberOfLines={1}>
          {startsInText}
        </Text>
      </Pressable>
      <FestivalSaveButton label={saveLabel} onPress={onPressSave} />
      {item.saved ? <Text style={styles.reminderHint}>You'll get notified before it starts</Text> : null}
    </View>
  );
}

export function FeaturedFestivalCard({ item, onPressCard, onPressSave }: Omit<FestivalCardProps, 'variant'>) {
  const saveLabel = item.saved ? 'Reminder set' : 'Remind me';
  const startsInText = getStartsInText(item.start_date);
  const imageUrl =
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).image_url ??
    (item as FestivalListItem & { image_url?: string; imageUrl?: string }).imageUrl;

  if (!imageUrl) {
    return <FestivalCard item={item} onPressCard={onPressCard} onPressSave={onPressSave} />;
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
          {item.start_date}
        </Text>
        <Text style={styles.featuredMeta} numberOfLines={1}>
          {startsInText}
        </Text>
      </View>
      <View style={styles.featuredCtaWrap}>
        <FestivalSaveButton label={saveLabel} onPress={onPressSave} floating floatingLarge />
      </View>
      {item.saved ? <Text style={styles.featuredReminderHint}>You'll get notified before it starts</Text> : null}
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
    paddingRight: 110,
  },
  featuredContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    paddingRight: 136,
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
  },
  heroReminderHint: {
    position: 'absolute',
    left: 14,
    right: 124,
    bottom: 8,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
  },
  featuredCtaWrap: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
  featuredReminderHint: {
    position: 'absolute',
    left: 18,
    right: 150,
    bottom: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
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
    minWidth: 92,
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
