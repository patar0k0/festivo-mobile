import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOfflineQueueSize } from '@/lib/plan/useOfflineQueueSize';

export function OfflineQueueBanner() {
  const queueSize = useOfflineQueueSize();
  const opacity = useRef(new Animated.Value(0)).current;
  const visible = queueSize > 0;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, { top: insets.top + 8, opacity }]}>
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text}>
          {queueSize === 1
            ? 'Офлайн режим · 1 промяна ще се синхронизира'
            : `Офлайн режим · ${queueSize} промени ще се синхронизират`}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.88)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#FCD34D',
  },
  text: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
