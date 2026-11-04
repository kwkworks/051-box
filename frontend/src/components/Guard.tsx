'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Me } from '@/lib/types';
import { useAuth } from './AuthProvider';

// 화면 접근 제어 (편의용). 실제 보안은 백엔드와 DB(RLS)가 담당한다.
type Need = 'login' | 'member' | 'admin';

export function Guard({ need, children }: { need: Need; children: (me: Me) => React.ReactNode }) {
  const { ready, session, me, meError, refreshMe } = useAuth();
  const router = useRouter();

  const role = me?.profile.role;
  const active = role === 'member' || role === 'admin'; // 승인 대기·거절은 회원 화면에 못 들어간다
  const allowed = !!me && (need === 'login' || (need === 'member' && active) || (need === 'admin' && role === 'admin'));

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!me) return;
    if (need !== 'login' && !active) router.replace('/pending');
    else if (need === 'admin' && role !== 'admin') router.replace('/');
  }, [ready, session, me, role, active, need, router]);

  if (meError) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4 text-center">
        <p className="mb-4 font-bold">{meError}</p>
        <button type="button" className="btn btn-primary" onClick={() => refreshMe()}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!allowed) return <Loading />;
  return <>{children(me)}</>;
}

export function Loading({ text = '불러오는 중이에요…' }: { text?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <div className="h-8 w-8 animate-spin rounded-sm border-4 border-ink border-t-yellow" />
      <p className="text-sm font-bold">{text}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3 border-[var(--danger)] p-3 text-sm" role="alert">
      <span className="font-bold text-[var(--danger)]">{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
