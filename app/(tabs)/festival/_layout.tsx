import { Stack } from 'expo-router';

export default function FestivalStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 280,
      }}
    />
  );
}
