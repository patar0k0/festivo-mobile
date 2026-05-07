import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationResponseNavigation } from '@/hooks/use-notification-response-navigation';
import { AuthProvider, useAuth } from '@/lib/auth/useAuth';
import { queryClient } from '@/lib/queryClient';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthNavigationSync() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const root = segments[0];
    const inAuthGroup = root === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  return null;
}

function RootStack() {
  useNotificationResponseNavigation();

  return (
    <>
      <AuthNavigationSync />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="festival/[slug]" options={{ headerShown: false }} />
<<<<<<< HEAD
        <Stack.Screen name="organizer/[slug]" options={{ headerShown: false }} />
=======
>>>>>>> 4d96467545513c65fa9f00fbf4149b41657b44b2
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile-notifications"
          options={{
            title: 'Известия',
            headerShown: true,
            headerBackTitle: 'Назад',
          }}
        />
        <Stack.Screen
          name="profile-about"
          options={{
            title: 'За приложението',
            headerShown: true,
            headerBackTitle: 'Назад',
          }}
        />
        <Stack.Screen
          name="profile-privacy"
          options={{
            title: 'Политика за поверителност',
            headerShown: true,
            headerBackTitle: 'Назад',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <RootStack />
          </QueryClientProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
