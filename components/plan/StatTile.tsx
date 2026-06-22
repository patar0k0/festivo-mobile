import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { festivalUi } from '@/components/ui/FestivalCard';
import { StyleSheet } from 'react-native';

export type StatTone = 'indigo' | 'amber' | 'emerald';

const PALETTE: Record<StatTone, { bubble: string; icon: string; text: string }> = {
  indigo: { bubble: '#EEF2FF', icon: '#4F46E5', text: '#0F172A' },
  amber: { bubble: '#FEF3C7', icon: '#D97706', text: '#0F172A' },
  emerald: { bubble: '#D1FAE5', icon: '#059669', text: '#0F172A' },
};

export function StatTile({
  value,
  label,
  icon,
  tone,
  delay = 0,
}: {
  value: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: StatTone;
  delay?: number;
}) {
  const palette = PALETTE[tone];
  return (
    <Reanimated.View entering={FadeInDown.duration(360).delay(delay).springify().damping(16)} style={styles.tile}>
      <View style={[styles.iconBubble, { backgroundColor: palette.bubble }]}>
        <Ionicons name={icon} size={16} color={palette.icon} />
      </View>
      <AnimatedCount style={[styles.value, { color: palette.text }]} value={String(value)} />
      <Text style={styles.label}>{label}</Text>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
    color: festivalUi.colors.text,
    letterSpacing: -0.6,
  },
  label: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '700',
    color: festivalUi.colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
