import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Bookmark icon that pulses when its `filled` state flips.
 * - Save: quick scale-up (1 → 1.22) → spring back.
 * - Unsave: subtle dip (1 → 0.88) → spring back.
 * Animation runs on the UI thread (Reanimated, native driver), so it remains
 * smooth on Android even when triggered alongside list re-renders.
 *
 * The icon swap is instantaneous to avoid double-flicker; the pulse only
 * applies to the wrapping transform.
 */

const PULSE_UP = 1.22;
const PULSE_DOWN = 0.88;
const SPRING = { mass: 0.6, damping: 11, stiffness: 220 } as const;

type Props = {
  filled: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedBookmark({
  filled,
  size = 22,
  color = '#FFFFFF',
  style,
}: Props) {
  const scale = useSharedValue(1);
  const lastFilledRef = useRef(filled);

  useEffect(() => {
    if (lastFilledRef.current === filled) return;
    const wasFilled = lastFilledRef.current;
    lastFilledRef.current = filled;
    if (filled && !wasFilled) {
      scale.value = withSequence(
        withTiming(PULSE_UP, { duration: 110 }),
        withSpring(1, SPRING),
      );
    } else if (!filled && wasFilled) {
      scale.value = withSequence(
        withTiming(PULSE_DOWN, { duration: 90 }),
        withSpring(1, SPRING),
      );
    }
  }, [filled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, animatedStyle, style]}>
      <View pointerEvents="none">
        <Ionicons
          name={filled ? 'bookmark' : 'bookmark-outline'}
          size={size}
          color={color}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
