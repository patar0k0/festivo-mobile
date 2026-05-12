import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { getSupabaseClient, isNativeSupabaseRuntime } from '@/lib/supabase/client';

// Warm up the browser on Android for faster OAuth sheet open
if (Platform.OS === 'android') {
  void WebBrowser.warmUpAsync();
}

export type GoogleSignInResult =
  | { outcome: 'success' }
  | { outcome: 'cancelled' }
  | { outcome: 'error'; error: Error };

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  register: (email: string, password: string) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<GoogleSignInResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isNativeSupabaseRuntime()) {
      setUser(null);
      setLoading(false);
      return;
    }

    let active = true;
    const supabase = getSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (__DEV__) {
          console.log('[TOKEN DEBUG]', data.session?.access_token ? 'present' : 'missing');
        }
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return { error: new Error('Login is only available in mobile runtime.') };
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return { error: new Error('Register is only available in mobile runtime.') };
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return { error: new Error('Reset password is only available in mobile runtime.') };
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<GoogleSignInResult> => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return { outcome: 'error', error: new Error('Google sign-in is only available in mobile runtime.') };
    }
    const supabase = getSupabaseClient();

    // The deep link Supabase will redirect back to after Google auth
    const redirectTo = Linking.createURL('/auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      return { outcome: 'error', error: error ? new Error(error.message) : new Error('Failed to get OAuth URL') };
    }

    // Open Google auth page in an in-app browser
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { outcome: 'cancelled' };
    }

    if (result.type !== 'success') {
      return { outcome: 'error', error: new Error('Authentication failed') };
    }

    // Exchange the code from the callback URL for a Supabase session
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (sessionError) {
      return { outcome: 'error', error: new Error(sessionError.message) };
    }

    return { outcome: 'success' };
  }, []);

  const logout = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, resetPassword, signInWithGoogle, logout }),
    [user, loading, login, register, resetPassword, signInWithGoogle, logout]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export async function getAccessToken(): Promise<string | null> {
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || typeof window === 'undefined') {
    return null;
  }
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
