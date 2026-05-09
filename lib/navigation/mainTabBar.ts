/**
 * Must match `tabBarStyle.height` in `app/(tabs)/_layout.tsx`.
 * Tab bar safe-area padding is handled by React Navigation; this is the styled bar height only.
 */
export const MAIN_TAB_BAR_HEIGHT = 64;

/**
 * Tab-bar clearance for overlays: measured height from the navigator when available, otherwise
 * {@link MAIN_TAB_BAR_HEIGHT}. Does not include OS safe area — add `insets.bottom` separately.
 */
export function resolveBottomTabBarOverlayHeight(
  contextHeight: number | undefined | null,
): number {
  if (typeof contextHeight === 'number' && Number.isFinite(contextHeight) && contextHeight > 0) {
    return contextHeight;
  }
  return MAIN_TAB_BAR_HEIGHT;
}
