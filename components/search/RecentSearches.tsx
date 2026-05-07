import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';

const COLORS = festivalUi.colors;

export type RecentSearchesProps = {
  terms: string[];
  onSelectTerm: (term: string) => void;
};

export function RecentSearches({ terms, onSelectTerm }: RecentSearchesProps) {
  if (terms.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}>
        {terms.map((term, index) => (
          <Pressable
            key={`${term}-${index}`}
            onPress={() => onSelectTerm(term)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Скорошно търсене: ${term}`}>
            <Text style={styles.chipText} numberOfLines={1}>
              {term}
            </Text>
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
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 220,
  },
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
