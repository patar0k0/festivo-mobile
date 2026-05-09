import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { getLabel, PlatformPressable } from '@react-navigation/elements';
import { CommonActions, useLinkBuilder, useLocale } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_METRICS, tabBarPaddingBottom } from '@/lib/navigation/tabBarMetrics';

const ACTIVE_TINT = '#0F172A';
const INACTIVE_TINT = '#94A3B8';
const ACCENT_COLOR = '#4F46E5';

type TabRoute = BottomTabBarProps['state']['routes'][number];

function emitTabHaptic() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function emitPlanHaptic() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function SideTabButton({
  route,
  descriptor,
  focused,
  navigation,
  navigatorKey,
}: {
  route: TabRoute;
  descriptor: BottomTabBarProps['descriptors'][string];
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
  navigatorKey: string;
}) {
  const { buildHref } = useLinkBuilder();
  const { options } = descriptor;
  const label = getLabel(
    {
      label: typeof options.tabBarLabel === 'string' ? options.tabBarLabel : undefined,
      title: options.title,
    },
    route.name,
  );
  const color = focused ? ACCENT_COLOR : INACTIVE_TINT;
  const labelColor = focused ? ACTIVE_TINT : INACTIVE_TINT;

  const onPress = () => {
    emitTabHaptic();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.dispatch({
        ...CommonActions.navigate(route),
        target: navigatorKey,
      });
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  return (
    <PlatformPressable
      href={buildHref(route.name, route.params)}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={options.tabBarAccessibilityLabel}
      testID={options.tabBarButtonTestID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.sidePressable}>
      <View style={styles.sideIconSlot}>
        {options.tabBarIcon?.({ focused, color, size: 24 })}
      </View>
      <Text style={[styles.sideLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
    </PlatformPressable>
  );
}

function CenterPlanButton({
  route,
  descriptor,
  focused,
  navigation,
  navigatorKey,
}: {
  route: TabRoute;
  descriptor: BottomTabBarProps['descriptors'][string];
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
  navigatorKey: string;
}) {
  const { buildHref } = useLinkBuilder();
  const { options } = descriptor;
  const label = getLabel(
    {
      label: typeof options.tabBarLabel === 'string' ? options.tabBarLabel : undefined,
      title: options.title,
    },
    route.name,
  );

  const scale = useRef(new Animated.Value(focused ? 1.04 : 1)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: focused ? 1.06 : 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  const onPress = () => {
    emitPlanHaptic();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.dispatch({
        ...CommonActions.navigate(route),
        target: navigatorKey,
      });
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  const orbSize = TAB_BAR_METRICS.centerOrbSize;

  return (
    <PlatformPressable
      href={buildHref(route.name, route.params)}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.centerPressable}
      hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}>
      <Animated.View
        style={[
          styles.centerOrbWrap,
          {
            marginTop: -TAB_BAR_METRICS.centerFabLift,
            width: orbSize,
            height: orbSize,
            transform: [{ scale }],
          },
        ]}>
        <View
          style={[
            styles.centerOrb,
            {
              width: orbSize,
              height: orbSize,
              borderRadius: orbSize / 2,
            },
            focused ? styles.centerOrbActive : styles.centerOrbIdle,
          ]}>
          {options.tabBarIcon?.({
            focused,
            color: focused ? ACCENT_COLOR : INACTIVE_TINT,
            size: focused ? 28 : 26,
          })}
          {focused && <View style={styles.activeDot} />}
        </View>
      </Animated.View>
      <Text
        style={[styles.centerLabel, { color: focused ? ACTIVE_TINT : INACTIVE_TINT }]}
        numberOfLines={1}>
        {label}
      </Text>
    </PlatformPressable>
  );
}

export function MainFestivoTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const { direction } = useLocale();
  const isRtl = direction === 'rtl';

  const routesByName = useMemo(() => {
    const m = new Map<string, TabRoute>();
    for (const r of state.routes) {
      m.set(r.name, r);
    }
    return m;
  }, [state.routes]);

  const indexRoute = routesByName.get('index');
  const mapRoute = routesByName.get('map');
  const planRoute = routesByName.get('plan');
  const profileRoute = routesByName.get('profile');

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onHeightChange?.(e.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  if (!indexRoute || !mapRoute || !planRoute || !profileRoute) {
    return null;
  }

  const firstSide = isRtl ? [profileRoute] : [indexRoute, mapRoute];
  const secondSide = isRtl ? [indexRoute, mapRoute] : [profileRoute];

  const isRouteFocused = (route: TabRoute) => state.routes[state.index]?.key === route.key;

  const paddingBottom = tabBarPaddingBottom(insets.bottom);

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: TAB_BAR_METRICS.centerFabLift,
          paddingBottom,
          paddingHorizontal: TAB_BAR_METRICS.rowPaddingHorizontal,
          borderTopLeftRadius: TAB_BAR_METRICS.topCornerRadius,
          borderTopRightRadius: TAB_BAR_METRICS.topCornerRadius,
        },
        TAB_BAR_METRICS.barShadow,
      ]}
      onLayout={onLayout}>
      <View style={[styles.row, { minHeight: TAB_BAR_METRICS.rowMinHeight }]}>
        <View style={[styles.flexSide, isRtl ? styles.sideTight : null]}>
          {firstSide.map((route) => (
            <SideTabButton
              key={route.key}
              route={route}
              descriptor={descriptors[route.key]}
              focused={isRouteFocused(route)}
              navigation={navigation}
              navigatorKey={state.key}
            />
          ))}
        </View>

        <View style={[styles.centerColumn, { width: TAB_BAR_METRICS.centerColumnWidth }]}>
          <CenterPlanButton
            route={planRoute}
            descriptor={descriptors[planRoute.key]}
            focused={isRouteFocused(planRoute)}
            navigation={navigation}
            navigatorKey={state.key}
          />
        </View>

        <View style={[styles.flexSide, isRtl ? null : styles.sideTight]}>
          {secondSide.map((route) => (
            <SideTabButton
              key={route.key}
              route={route}
              descriptor={descriptors[route.key]}
              focused={isRouteFocused(route)}
              navigation={navigation}
              navigatorKey={state.key}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  flexSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
  },
  sideTight: {
    justifyContent: 'center',
  },
  centerColumn: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sidePressable: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 64,
  },
  sideIconSlot: {
    height: TAB_BAR_METRICS.sideIconSlotHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: {
    marginTop: 2,
    fontSize: TAB_BAR_METRICS.labelFontSize,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  centerPressable: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: Platform.OS === 'android' ? 2 : 0,
  },
  centerOrbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  centerOrbIdle: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  centerOrbActive: {
    backgroundColor: '#0F172A',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      default: {
        elevation: 4,
      },
    }),
  },
  activeDot: {
    position: 'absolute',
    bottom: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT_COLOR,
  },
  centerLabel: {
    marginTop: 2,
    fontSize: TAB_BAR_METRICS.labelFontSize,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
