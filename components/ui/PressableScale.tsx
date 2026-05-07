import { forwardRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Pressable with a Reanimated-driven scale-down on press-in and a
 * spring-back release. Runs entirely on the UI thread (native driver), so it
 * stays smooth on Android even inside long lists.
 *
 * IMPORTANT: this is a drop-in replacement for `Pressable` for cards/tappable
 * rows — the press handlers (onPress, onPressIn, onPressOut) keep their RN
 * semantics, so save/follow/navigation logic is untouched.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_IN_DURATION = 90;
const RELEASE_SPRING = {
  mass: 0.55,
  damping: 14,
  stiffness: 220,
} as const;

type Props = Omit<PressableProps, 'style'> & {
  /** Target scale on press-in. Defaults to 0.97. */
  pressedScale?: number;
  /** Optional opacity dim while pressed. Defaults to 1 (no dim). */
  pressedOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export const PressableScale = forwardRef<View, Props>(function PressableScale(
  {
    pressedScale = 0.97,
    pressedOpacity = 1,
    style,
    onPressIn,
    onPressOut,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withTiming(pressedScale, { duration: PRESS_IN_DURATION });
      if (pressedOpacity !== 1) {
        opacity.value = withTiming(pressedOpacity, { duration: PRESS_IN_DURATION });
      }
      onPressIn?.(e);
    },
    [scale, opacity, pressedScale, pressedOpacity, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, RELEASE_SPRING);
      if (pressedOpacity !== 1) {
        opacity.value = withTiming(1, { duration: 140 });
      }
      onPressOut?.(e);
    },
    [scale, opacity, pressedOpacity, onPressOut],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
});
