import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';

import { resolveBottomTabBarOverlayHeight } from '@/lib/navigation/mainTabBar';

/**
 * Bottom padding to clear the main tab bar when drawing edge-to-edge UI (e.g. sticky bars).
 * Uses `BottomTabBarHeightContext` inside tabs; falls back to `MAIN_TAB_BAR_HEIGHT` on root-stack
 * routes where the tab navigator context is missing but the tab bar is still visible underneath.
 *
 * Always combine with `useSafeAreaInsets().bottom` (or `SafeAreaView` `edges={['bottom']}`) for
 * system navigation / home indicator — tab bar height does not replace that inset.
 */
export function useBottomTabBarOverlayHeight(): number {
  const contextHeight = useContext(BottomTabBarHeightContext);
  return resolveBottomTabBarOverlayHeight(contextHeight);
}
