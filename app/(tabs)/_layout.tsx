import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabsGroupLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 6,
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
        name="following"
        options={{
          title: "Following",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="people-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Запазени',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="bookmark-outline" size={focused ? 24 : 22} color={color} />
          ),
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
