import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

const CITY_EMOJI: Record<string, string> = {
  'София':        '🏛️',
  'Пловдив':      '🏺',
  'Варна':        '🌊',
  'Бургас':       '⛵',
  'Русе':         '🌉',
  'Стара Загора': '🌾',
};

export type PopularCitiesProps = {
  onSelectCity: (city: string) => void;
};

export function PopularCities({ onSelectCity }: PopularCitiesProps) {
  return (
    <View style={styles.grid}>
      {POPULAR_CITIES_BG.map((city) => (
        <Pressable
          key={city}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelectCity(city);
          }}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Град: ${city}`}>
          <Text style={styles.chipEmoji}>{CITY_EMOJI[city] ?? '📍'}</Text>
          <Text style={styles.chipText}>{city}</Text>
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
