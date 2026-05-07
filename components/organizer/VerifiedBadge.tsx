import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** Icon-only when true (default). */
  compact?: boolean;
};

export function VerifiedBadge({ compact = true }: Props) {
  const size = compact ? 15 : 16;
  return (
    <View
      style={[styles.wrap, compact ? styles.wrapCompact : styles.wrapExpanded]}
      accessibilityRole="text"
      accessibilityLabel="Потвърден организатор">
      <Ionicons name="checkmark-circle" size={size} color="#059669" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(5, 150, 105, 0.35)',
  },
  wrapCompact: {
    width: 22,
    height: 22,
  },
  wrapExpanded: {
    padding: 4,
  },
});
