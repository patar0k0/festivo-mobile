import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { festivalUi } from '@/components/ui/FestivalCard';

const COLORS = festivalUi.colors;

export type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onClear: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  onBlurSearch?: () => void;
};

export function SearchBar({
  value,
  onChangeText,
  onBack,
  onClear,
  placeholder = 'Търси фестивали, град, тема…',
  autoFocus = true,
  onBlurSearch,
}: SearchBarProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Назад">
        <Ionicons name="chevron-back" size={28} color={COLORS.text} />
      </Pressable>
      <View style={styles.inputShell}>
        <Ionicons name="search-outline" size={22} color={COLORS.muted} style={styles.searchGlyph} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          onBlur={() => onBlurSearch?.()}
          accessibilityLabel="Поле за търсене"
        />
        {value.length > 0 ? (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Изчисти">
            <Ionicons name="close-circle" size={22} color={COLORS.secondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    paddingVertical: 8,
    paddingRight: 4,
    marginLeft: -4,
  },
  iconBtnPressed: {
    opacity: 0.65,
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  searchGlyph: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: COLORS.text,
    paddingVertical: 12,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 2,
  },
});
