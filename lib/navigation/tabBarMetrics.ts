import { Platform } from 'react-native';

/**
 * Single source of truth for the custom bottom tab bar layout.
 * Adjust these together when tuning FAB size, lift, or vertical space.
 */
export const TAB_BAR_METRICS = {
  /** Minimum padding when safe-area bottom is 0 (e.g. some simulators). */
  safeAreaBottomMin: 8,

  /** Horizontal inset for the tab row. */
  rowPaddingHorizontal: 6,

  /** Reserved space above the row so the center orb can sit “floating” without layout overflow. */
  centerFabLift: 12,

  /** Diameter of the center “Моят план” control. */
  centerOrbSize: 56,

  /** Width reserved for the center column between side pairs. */
  centerColumnWidth: 90,

  /** Minimum height of the side-tab row (icons + labels). */
  rowMinHeight: 60,

  /** Rounded top corners of the bar surface. */
  topCornerRadius: 24,

  sideIconSlotHeight: 30,

  labelFontSize: 11,

  /** Subtle platform shadow for the bar chrome (not the center orb). */
  barShadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -1 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    default: {
      elevation: 6,
    },
  }),
} as const;

export function tabBarPaddingBottom(insetsBottom: number): number {
  return Math.max(insetsBottom, TAB_BAR_METRICS.safeAreaBottomMin);
}
