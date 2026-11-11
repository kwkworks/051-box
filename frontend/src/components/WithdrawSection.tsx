'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';
import type { Profile } from '@/lib/types';

const CONFIRM_WORD = '탈퇴';

// 회원 탈퇴: 계정과 모든 기록(1RM, PR, 채팅, 모임, 참가 신청, 알림 설정)을 지운다. 되돌릴 수 없다.
export function WithdrawSection({ profile }: { profile: Profile }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = profile.role === 'admin';

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.del('/me');
      await signOut();
      router.replace('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : '탈퇴하지 못했어요');
      setBusy(false);
    }
  };

  return (
    <section className="card mt-8 p-4" aria-label="회원 탈퇴">
      <h2 className="font-black">회원 탈퇴</h2>
      {isAdmin ? (
        <p className="mt-1 text-sm text-muted">관리자 계정은 탈퇴할 수 없어요. 다른 관리자에게 권한을 넘긴 뒤 진행해주세요.</p>
      ) : !open ? (
        <>
          <p className="mt-1 text-sm text-muted">탈퇴하면 계정과 모든 기록이 바로 지워지고 되돌릴 수 없어요.</p>
          <button type="button" className="btn btn-sm mt-3" onClick={() => setOpen(true)}>
            탈퇴하기
          </button>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <ul className="list-disc pl-5 text-sm">
            <li>1RM·네임드 WOD 기록과 명예의 벽 글</li>
            <li>채팅, 내가 만든 모임, 참가 신청, 출석 기록</li>
            <li>닉네임·캐릭터와 알림 설정</li>
          </ul>
          <p className="text-sm font-bold text-[var(--danger)]">위 내용이 모두 지워지고 되돌릴 수 없어요.</p>
          <div>
            <label className="label" htmlFor="withdraw-confirm">
              계속하려면 &quot;{CONFIRM_WORD}&quot;를 입력하세요
            </label>
            <input id="withdraw-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          {error && (
            <p className="text-sm font-bold text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger flex-1" disabled={busy || typed.trim() !== CONFIRM_WORD} onClick={withdraw}>
              {busy ? '지우는 중…' : '계정과 기록 모두 지우기'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
