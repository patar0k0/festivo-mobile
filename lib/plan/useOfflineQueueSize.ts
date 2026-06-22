import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { compactPlannerQueueForPersistence } from '@/lib/plan/offlineQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_V2 = 'festivo.plannerMutationQueue.v2';
const POLL_INTERVAL_MS = 4_000;

async function readQueueSize(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return 0;
    return compactPlannerQueueForPersistence(parsed as never).length;
  } catch {
    return 0;
  }
}

export function useOfflineQueueSize(): number {
  const [size, setSize] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    void readQueueSize().then(setSize);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (size > 0) {
      intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [size, refresh]);

  return size;
}
