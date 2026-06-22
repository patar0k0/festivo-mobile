import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import type { SearchFilters, SearchWhenPreset } from '@/lib/api/search';

const WHEN_LABELS: Record<SearchWhenPreset, string> = {
  today:      'Днес',
  tomorrow:   'Утре',
  weekend:    'Уикенд',
  this_week:  'Тази седмица',
  this_month: 'Този месец',
};

type Chip = { key: string; label: string; onRemove: () => void };

type Props = {
  filters: SearchFilters;
  onUpdate: (next: SearchFilters) => void;
};

export function ActiveFilterChips({ filters, onUpdate }: Props) {
  const chips: Chip[] = [];

  if (filters.when) {
    chips.push({
      key: 'when',
      label: WHEN_LABELS[filters.when],
      onRemove: () => onUpdate({ ...filters, when: undefined }),
    });
  }
  if (filters.city) {
    chips.push({
      key: 'city',
      label: filters.city,
      onRemove: () => onUpdate({ ...filters, city: undefined }),
    });
  }
  if (filters.category) {
    chips.push({
      key: 'category',
      label: filters.category,
      onRemove: () => onUpdate({ ...filters, category: undefined }),
    });
  }
  if (filters.free) {
    chips.push({
      key: 'free',
      label: 'Безплатни',
      onRemove: () => onUpdate({ ...filters, free: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {chips.map((chip) => (
        <PressableScale
          key={chip.key}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            chip.onRemove();
          }}
          pressedScale={0.95}
          pressedOpacity={0.82}
          style={styles.chip}>
          <Text style={styles.chipText}>{chip.label}</Text>
          <Ionicons name="close-circle" size={15} color="#4F46E5" />
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingBottom: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
});
