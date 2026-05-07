import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Shared skeleton primitives — all instances share a single Animated.Value
 * looped on the native driver, so every shimmer is in phase, costs no extra
 * JS frames per row, and feels consistent across screens (Android-friendly).
 *
 * Use the exported `skeletonRadii` / `skeletonRhythm` to keep radii & spacing
 * aligned with real cards (festival rows, popular rows, organizer rows).
 */

export const skeletonRadii = {
  pill: 999,
  card: 16,
  thumb: 12,
  line: 6,
} as const;

export const skeletonRhythm = {
  thumb: 72,
  thumbSmall: 64,
  lineGapSm: 6,
  lineGapMd: 8,
  lineGapLg: 10,
  lineLg: 14,
  lineMd: 12,
  lineSm: 11,
} as const;

const BASE_COLOR = '#E5E7EB';
const PULSE_DURATION = 1100;
const PULSE_LOW = 0.55;
const PULSE_HIGH = 1;

const sharedPulse = new Animated.Value(PULSE_LOW);
let sharedPulseStarted = false;

function ensureSharedPulse() {
  if (sharedPulseStarted) return;
  sharedPulseStarted = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(sharedPulse, {
        toValue: PULSE_HIGH,
        duration: PULSE_DURATION / 2,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sharedPulse, {
        toValue: PULSE_LOW,
        duration: PULSE_DURATION / 2,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]),
  ).start();
}

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Single shimmering rectangle. All instances share one looped Animated.Value
 * so every skeleton on screen pulses together at the same tempo.
 */
export function Skeleton({
  width,
  height,
  radius = skeletonRadii.line,
  style,
}: SkeletonProps) {
  const opacityRef = useRef(sharedPulse).current;
  useEffect(() => {
    ensureSharedPulse();
  }, []);
  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radius, opacity: opacityRef },
        style,
      ]}
    />
  );
}

/**
 * Static placeholder block (no shimmer) — useful for tinted backgrounds
 * behind images so they never show a white flash before loading.
 */
export function SkeletonPlaceholder({
  width,
  height,
  radius = skeletonRadii.line,
  style,
}: SkeletonProps) {
  return (
    <View
      style={[
        styles.base,
        { width, height, borderRadius: radius },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: BASE_COLOR,
  },
});
