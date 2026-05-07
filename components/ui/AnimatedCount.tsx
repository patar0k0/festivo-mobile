import { useEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Animated text label for values that change as a result of an action
 * (e.g. follower count after follow/unfollow). The visual treatment is a
 * brief fade-down + slight downward nudge → fade-up — premium but minimal.
 *
 * The label is just text, so layout never jumps if the new string has a
 * different width.
 */

const FADE_OUT = 130;
const FADE_IN = 220;

type Props = {
  /** The value to show. Animates on change (string identity). */
  value: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function AnimatedCount({ value, style, numberOfLines }: Props) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const lastRef = useRef(value);

  useEffect(() => {
    if (lastRef.current === value) return;
    lastRef.current = value;
    opacity.value = withTiming(0.35, { duration: FADE_OUT });
    translateY.value = withTiming(-3, { duration: FADE_OUT }, () => {
      translateY.value = 3;
      opacity.value = withTiming(1, { duration: FADE_IN });
      translateY.value = withTiming(0, { duration: FADE_IN });
    });
  }, [value, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text
      style={[styles.text, style, animatedStyle]}
      numberOfLines={numberOfLines}>
      {value}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    includeFontPadding: false,
  },
});
