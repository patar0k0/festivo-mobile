import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { MainFestivoTabBar } from '@/components/navigation/MainFestivoTabBar';
import { useMobilePlanState } from '@/lib/query/useMobilePlanState';

export default function TabsGroupLayout() {
  useMobilePlanState();
  return (
    <Tabs
      tabBar={(props) => <MainFestivoTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={24} color={color} />
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
