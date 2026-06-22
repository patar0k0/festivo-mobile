import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | null = null;
let webSupabaseInstance: SupabaseClient | null = null;

/**
 * Resolves once the Supabase client has loaded the initial session from
 * AsyncStorage (INITIAL_SESSION event). API calls that need a token should
 * await this before calling getSession(), otherwise they race the storage read
 * and get a null token on cold start.
 */
let sessionReadyPromise: Promise<void> | null = null;

export function isNativeSupabaseRuntime(): boolean {
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  return isNativePlatform && typeof window !== 'undefined';
}

export function getSupabaseClient(): SupabaseClient {
  // Web (expo web) — uses default localStorage-based auth for dev/testing
  if (Platform.OS === 'web') {
    if (!webSupabaseInstance) {
      webSupabaseInstance = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    }
    return webSupabaseInstance;
  }

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

  // Set up the "session ready" promise once on first client creation.
  // Supabase fires INITIAL_SESSION when it has finished reading from storage.
  sessionReadyPromise = new Promise<void>((resolve) => {
    const { data: { subscription } } = supabaseInstance!.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') {
        subscription.unsubscribe();
        resolve();
      }
    });
    // Safety timeout: if INITIAL_SESSION never fires (e.g. no storage),
    // resolve after 3s so API calls aren't blocked forever.
    setTimeout(resolve, 3_000);
  });

  return supabaseInstance;
}

/**
 * Wait for Supabase to finish reading the initial session from storage.
 * Safe to call before the client is created — returns immediately in that case.
 */
export async function waitForSessionReady(): Promise<void> {
  if (sessionReadyPromise) await sessionReadyPromise;
}
