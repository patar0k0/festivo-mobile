export async function loadNotifications() {
  if (__DEV__) return null;
  return await import('expo-notifications');
}
