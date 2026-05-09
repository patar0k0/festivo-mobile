import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { AnimatedBookmark } from '@/components/ui/AnimatedBookmark';
import { PressableScale } from '@/components/ui/PressableScale';
import { festivalUi } from '@/components/ui/FestivalCard';

const BAR_HEIGHT = 50;

type Props = {
  saved: boolean;
  saveBusy: boolean;
  onSave: () => void;
  onShare: () => void;
  onCalendar: () => void;
  calendarDisabled?: boolean;
};

export const FestivalDetailStickyBar = memo(function FestivalDetailStickyBar({
  saved,
  saveBusy,
  onSave,
  onShare,
  onCalendar,
  calendarDisabled,
}: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.inner}>
        <ActionIcon
          label={saved ? 'В плана' : 'В план'}
          icon={saved ? 'checkmark-circle' : 'add-circle-outline'}
          onPress={onSave}
          disabled={saveBusy}
          loading={saveBusy}
          primary
        />
        <ActionIcon label="Сподели" icon="share-outline" onPress={onShare} />
        <ActionIcon
          label="Календар"
          icon="calendar-outline"
          onPress={onCalendar}
          disabled={calendarDisabled}
        />
      </View>
    </View>
  );
});

function ActionIcon({
  label,
  icon,
  bookmarkFilled,
  onPress,
  disabled,
  loading,
  primary,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** When set, render an AnimatedBookmark (with pulse) instead of a plain Ionicon. */
  bookmarkFilled?: boolean;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
}) {
  const showBookmark = typeof bookmarkFilled === 'boolean';
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      pressedScale={0.96}
      pressedOpacity={0.9}
      style={[
        styles.action,
        primary && styles.actionPrimary,
        (disabled || loading) && styles.actionDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : showBookmark ? (
        <AnimatedBookmark
          filled={Boolean(bookmarkFilled)}
          size={22}
          color={primary ? '#FFFFFF' : festivalUi.colors.text}
        />
      ) : (
        <Ionicons name={icon} size={22} color={primary ? '#FFFFFF' : festivalUi.colors.text} />
      )}
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 9,
      },
    }),
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 5,
    minHeight: BAR_HEIGHT,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    marginHorizontal: 2,
    borderRadius: 12,
    gap: 3,
  },
  actionPrimary: {
    backgroundColor: festivalUi.colors.buttonBg,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: festivalUi.colors.text,
  },
  actionLabelPrimary: {
    color: '#FFFFFF',
  },
});
