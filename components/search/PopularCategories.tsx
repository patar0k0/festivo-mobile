import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';

const COLORS = festivalUi.colors;

export const POPULAR_CATEGORIES_BG = [
  'Фолклор',
  'Концерти',
  'Храна',
  'Деца',
  'Традиции',
  'Рок',
  'Джаз',
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  'Фолклор':    '🪗',
  'Концерти':   '🎵',
  'Храна':      '🍽️',
  'Деца':       '🎠',
  'Традиции':   '🪔',
  'Рок':        '🎸',
  'Джаз':       '🎷',
};

export type PopularCategoriesProps = {
  onSelectCategory: (label: string) => void;
};

export function PopularCategories({ onSelectCategory }: PopularCategoriesProps) {
  return (
    <View style={styles.grid}>
      {POPULAR_CATEGORIES_BG.map((label) => (
        <Pressable
          key={label}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelectCategory(label);
          }}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Категория: ${label}`}>
          <Text style={styles.chipEmoji}>{CATEGORY_EMOJI[label] ?? '🎉'}</Text>
          <Text style={styles.chipText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  chipEmoji: { fontSize: 15 },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});
