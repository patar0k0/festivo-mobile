import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MobilePlanReminderType } from '@/lib/api/mobilePlan';

type Option = {
  type: MobilePlanReminderType;
  label: string;
};

type Props = {
  visible: boolean;
  selectedType: MobilePlanReminderType;
  pending?: boolean;
  onClose: () => void;
  onSelect: (type: MobilePlanReminderType) => void;
};

const OPTIONS: Option[] = [
  { type: 'default', label: 'По подразбиране' },
  { type: '24h', label: '24ч преди' },
  { type: 'same_day_09', label: 'В деня' },
  { type: 'none', label: 'Без напомняне' },
];

export function ReminderBottomSheet({ visible, selectedType, pending, onClose, onSelect }: Props) {
  const translateY = useRef(new Animated.Value(320)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(320);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, translateY, visible]);

  const closeAnimated = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 320, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={closeAnimated}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Напомняне</Text>
          {OPTIONS.map((option) => {
            const selected = option.type === selectedType;
            return (
              <Pressable
                key={option.type}
                onPress={() => onSelect(option.type)}
                disabled={pending}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && !pending && styles.rowPressed,
                ]}>
                <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{option.label}</Text>
                {selected ? <Ionicons name="checkmark" size={18} color="#111827" /> : null}
              </Pressable>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.35)' },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 8,
  },
  handle: {
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 4 },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowSelected: { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' },
  rowPressed: { opacity: 0.75 },
  rowText: { fontSize: 15, color: '#374151', fontWeight: '600' },
  rowTextSelected: { color: '#111827', fontWeight: '700' },
});
