import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';

const COLORS = festivalUi.colors;

export const POPULAR_CITIES_BG = [
  'София',
  'Пловдив',
  'Варна',
  'Бургас',
  'Русе',
  'Стара Загора',
] as const;

export type PopularCitiesProps = {
  onSelectCity: (city: string) => void;
};

export function PopularCities({ onSelectCity }: PopularCitiesProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}>
        {POPULAR_CITIES_BG.map((city) => (
          <Pressable
            key={city}
            onPress={() => onSelectCity(city)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Град: ${city}`}>
            <Text style={styles.chipText}>{city}</Text>
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
