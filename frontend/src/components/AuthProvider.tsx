'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ApiError, api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Me } from '@/lib/types';

type AuthState = {
  ready: boolean;
  session: Session | null;
  me: Me | null;
  meError: string | null;
  refreshMe: () => Promise<Me | null>;
  setMe: (updater: (prev: Me | null) => Me | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMeState] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  // 내 정보를 다시 불러오고 결과를 돌려준다 (실패하면 null)
  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const next = await api.get<Me>('/me');
      setMeError(null);
      setMeState(next);
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await supabase.auth.signOut();
        setMeState(null);
      } else {
        setMeError(e instanceof Error ? e.message : '정보를 불러오지 못했어요');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setMeState(null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  // 로그인한 사용자가 바뀌면 내 정보를 다시 불러온다
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    api.get<Me>('/me').then(
      (next) => {
        if (!alive) return;
        setMeError(null);
        setMeState(next);
      },
      async (e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) {
          await supabase.auth.signOut();
          setMeState(null);
        } else {
          setMeError(e instanceof Error ? e.message : '정보를 불러오지 못했어요');
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    try {
      sessionStorage.clear();
    } catch {}
    setMeState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, session, me, meError, refreshMe, setMe: setMeState, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
