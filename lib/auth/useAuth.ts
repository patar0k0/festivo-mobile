import type { User } from '@supabase/supabase-js';
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

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
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

  const logout = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
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
