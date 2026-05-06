import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

export type PopularCategoriesProps = {
  onSelectCategory: (label: string) => void;
};

export function PopularCategories({ onSelectCategory }: PopularCategoriesProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}>
        {POPULAR_CATEGORIES_BG.map((label) => (
          <Pressable
            key={label}
            onPress={() => onSelectCategory(label)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Категория: ${label}`}>
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -4,
  },
  scrollContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  chipPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
