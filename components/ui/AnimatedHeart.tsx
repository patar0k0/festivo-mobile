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
 * Heart icon used for the social "like" action (separate from the bookmark
 * "save to plan" affordance). Animation matches AnimatedBookmark so the two
 * affordances feel like siblings in the same family.
 */

const PULSE_UP = 1.28;
const PULSE_DOWN = 0.88;
const SPRING = { mass: 0.6, damping: 11, stiffness: 220 } as const;

type Props = {
  filled: boolean;
  size?: number;
  color?: string;
  outlineColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedHeart({
  filled,
  size = 22,
  color = '#EF4444',
  outlineColor,
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
        withTiming(PULSE_UP, { duration: 120 }),
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
          name={filled ? 'heart' : 'heart-outline'}
          size={size}
          color={filled ? color : outlineColor ?? color}
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
