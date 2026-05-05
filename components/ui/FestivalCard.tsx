import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  title: { fontSize: 19, fontWeight: '600' as const, color: colors.text },
  sectionTitle: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  secondary: { fontSize: 15, color: colors.secondary },
  muted: { fontSize: 14, color: colors.muted },
};

export const festivalUi = {
  colors,
  typography,
  screenPadding: 16,
  sectionGap: 24,
  cardGap: 12,
};

type FestivalCardProps = {
  item: FestivalListItem;
  onPressCard: () => void;
  onPressSave: () => void;
  /** Wider fixed width for horizontal carousels */
  variant?: 'default' | 'carousel';
};

export function FestivalSaveButton({
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
        styles.saveButton,
        disabled && styles.saveButtonDisabled,
        pressed && !disabled && styles.saveButtonPressed,
      ]}>
      <Text style={styles.saveButtonText}>{label}</Text>
    </Pressable>
  );
}

export function FestivalCard({ item, onPressCard, onPressSave, variant = 'default' }: FestivalCardProps) {
  const saveLabel = item.saved ? 'Remove from saved' : 'Save festival';

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
      </Pressable>
      <FestivalSaveButton label={saveLabel} onPress={onPressSave} />
    </View>
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
  city: {
    marginTop: 6,
  },
  date: {
    marginTop: 4,
  },
  saveButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.buttonBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.buttonBg,
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
