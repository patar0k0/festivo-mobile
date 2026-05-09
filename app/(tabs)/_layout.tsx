import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { MAIN_TAB_BAR_HEIGHT } from '@/lib/navigation/mainTabBar';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';

function PlanTabBarButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      style={(state) => [
        typeof props.style === 'function' ? props.style(state) : props.style,
        styles.planTabButton,
      ]}
    />
  );
}

export default function TabsGroupLayout() {
  useMobilePlanState();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          display: 'flex',
          height: MAIN_TAB_BAR_HEIGHT,
          paddingTop: 4,
          paddingBottom: 4,
          borderTopWidth: 1,
          borderTopColor: '#EEEEEE',
          backgroundColor: '#FFFFFF',
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Начало',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="home-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Карта',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="map-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Моят план',
          tabBarButton: PlanTabBarButton,
          tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bookmark' : 'bookmark-outline'}
              size={focused ? 36 : 32}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="following"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="festival"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профил',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="person-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  planTabButton: {
    marginTop: -10,
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
});
