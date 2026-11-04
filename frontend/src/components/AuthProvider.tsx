'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ApiError, api } from '@/lib/api';
import { stopBgm } from '@/lib/bgm';
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

// 왜 로그아웃됐는지 기록 (로그인 화면에서 안내, 원인 확인용)
export const SIGNOUT_KEY = 'box-signout-reason';
function noteSignOut(reason: string) {
  try {
    localStorage.setItem(SIGNOUT_KEY, JSON.stringify({ reason, at: new Date().toISOString() }));
  } catch {}
}

// API가 401을 줬을 때: 정말 로그인이 끝났는지 Supabase에 직접 확인한다 (네트워크 문제면 로그아웃하지 않음)
async function sessionReallyEnded(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return false;
    return !!error && typeof error.status === 'number' && error.status >= 400 && error.status < 500;
  } catch {
    return false;
  }
}

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
      if (e instanceof ApiError && e.status === 401 && (await sessionReallyEnded())) {
        noteSignOut('expired');
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // 사용자가 누르지 않았는데 로그아웃되면 (토큰 갱신 실패 등) 이유를 남긴다
      if (event === 'SIGNED_OUT') {
        try {
          if (!localStorage.getItem(SIGNOUT_KEY)) noteSignOut('refresh-failed');
        } catch {}
      } else if (event === 'SIGNED_IN') {
        // 다시 로그인했으면 안내는 지우고, 원인 확인용으로 마지막 기록만 남겨둔다
        try {
          const last = localStorage.getItem(SIGNOUT_KEY);
          if (last) localStorage.setItem(`${SIGNOUT_KEY}-last`, last);
          localStorage.removeItem(SIGNOUT_KEY);
        } catch {}
      }
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
        if (e instanceof ApiError && e.status === 401 && (await sessionReallyEnded())) {
          noteSignOut('expired');
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
    stopBgm();
    noteSignOut('user');
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
