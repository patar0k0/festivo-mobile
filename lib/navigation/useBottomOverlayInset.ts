import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomTabBarOverlayHeight } from '@/lib/navigation/useBottomTabBarOverlayHeight';

/**
 * Space to leave under floating bottom UI: OS navigation / home indicator plus main tab bar
 * (measured in tabs, {@link MAIN_TAB_BAR_HEIGHT} fallback on root-stack routes).
 */
export function useBottomOverlayInset(): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarOverlayHeight();
  return insets.bottom + tabBarHeight;
}
