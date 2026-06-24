import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={42} color="#9CA3AF" />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { marginTop: 10, fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: { marginTop: 6, textAlign: 'center', fontSize: 14, color: '#6B7280' },
  button: {
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
