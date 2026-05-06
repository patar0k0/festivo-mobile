import { isExpoGo } from '@/lib/push/isExpoGo';

export async function loadNotifications() {
  if (isExpoGo) return null;
  return await import('expo-notifications');
}
