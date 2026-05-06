import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';
import type { FestivalListItem } from '@/lib/api/festivals';
import { getRelativeDateLabel } from '@/lib/festival/relativeDate';

const COLORS = festivalUi.colors;

export type SearchResultCardProps = {
  item: FestivalListItem;
  onPressCard: () => void;
  onPressSave: () => void;
  saveDisabled?: boolean;
};

export function SearchResultCard({
  item,
  onPressCard,
  onPressSave,
  saveDisabled,
}: SearchResultCardProps) {
  const uri = item.image_url?.trim() ? item.image_url.trim() : null;
  const dateLabel = getRelativeDateLabel(item.start_date);
  const isSaving = Boolean(saveDisabled);
  const bookmarkColor = item.saved ? COLORS.text : COLORS.secondary;

  return (
    <Pressable
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.city || 'България'}`}>
      <View style={styles.thumb}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient colors={['#E85D5D', '#B91C1C']} style={StyleSheet.absoluteFill}>
            <Text style={styles.thumbEmoji}>🎉</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.city} numberOfLines={1}>
          {item.city?.trim() ? item.city : 'България'}
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <Pressable
        disabled={saveDisabled}
        onPress={onPressSave}
        style={({ pressed }) => [
          styles.saveBtn,
          saveDisabled && styles.saveDisabled,
          pressed && !saveDisabled && styles.savePressed,
        ]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={item.saved ? 'Премахни от запазени' : 'Запази'}>
        {isSaving ? (
          <ActivityIndicator size="small" color={bookmarkColor} />
        ) : (
          <Ionicons
            name={item.saved ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={bookmarkColor}
          />
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  thumbEmoji: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 72,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  city: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  date: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.secondary,
  },
  saveBtn: {
    padding: 6,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  savePressed: {
    opacity: 0.65,
  },
});
