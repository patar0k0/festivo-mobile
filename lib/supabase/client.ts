import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | null = null;

export function isNativeSupabaseRuntime(): boolean {
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  return isNativePlatform && typeof window !== 'undefined';
}

export function getSupabaseClient(): SupabaseClient {
  if (!isNativeSupabaseRuntime()) {
    throw new Error('Supabase client is only available in React Native runtime.');
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}
