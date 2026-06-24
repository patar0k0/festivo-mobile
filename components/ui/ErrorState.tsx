import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ message = 'Нещо се обърка', onRetry }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name="cloud-offline-outline" size={42} color="#9CA3AF" />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Опитай пак</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 10, textAlign: 'center', fontSize: 15, color: '#374151' },
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
