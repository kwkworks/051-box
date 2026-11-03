'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Guard } from '@/components/Guard';
import { QuickMenu } from '@/components/QuickMenu';
import { BoxSpace } from '@/game/BoxSpace';
import { BOARDS, type BoardKey } from '@/game/map';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

export default function HomePage() {
  return <Guard need="member">{(me) => <Space me={me} />}</Guard>;
}

function Space({ me }: { me: Me }) {
  const router = useRouter();
  const { setMe } = useAuth();
  const chatRef = useRef<((text: string) => void) | null>(null);
  const [chat, setChat] = useState('');
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  };

  const checkIn = async () => {
    setChecking(true);
    try {
      const res = await api.post<{ streak: number; alreadyChecked: boolean }>('/me/attendance');
      setMe((prev) => (prev ? { ...prev, checkedInToday: true, streak: res.streak } : prev));
      showToast(res.alreadyChecked ? '오늘은 이미 출석했어요' : `출석 완료! 🔥 ${res.streak}일 연속`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '출석하지 못했어요');
    } finally {
      setChecking(false);
    }
  };

  const open = (board: BoardKey) => router.push(BOARDS[board].href);

  return (
    <div className="flex h-dvh flex-col bg-[#121214]">
      <header className="z-10 flex items-center gap-2 border-b-2 border-black bg-[var(--burgundy)] px-3 py-2 text-white">
        <Link href="/avatar" className="truncate text-sm font-extrabold" title="캐릭터 꾸미기">
          {me.profile.nickname}
        </Link>
        <span className="chip border-yellow bg-transparent text-yellow">🔥 {me.streak}일</span>
        <div className="flex-1" />
        <button type="button" className="btn btn-sm btn-primary" disabled={me.checkedInToday || checking} onClick={checkIn}>
          {me.checkedInToday ? '출석 완료' : checking ? '체크 중…' : '출석 체크'}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <BoxSpace profile={me.profile} onOpenBoard={open} chatRef={chatRef} />

        {toast && (
          <div className="card absolute left-1/2 top-12 -translate-x-1/2 px-4 py-2 text-sm font-bold" role="status">
            {toast}
          </div>
        )}

        <form
          className="absolute bottom-4 left-3 right-28 flex gap-2 sm:right-auto sm:w-96"
          onSubmit={(e) => {
            e.preventDefault();
            chatRef.current?.(chat);
            setChat('');
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            className="input min-h-10 flex-1 bg-white/95"
            value={chat}
            maxLength={60}
            onChange={(e) => setChat(e.target.value)}
            placeholder="말풍선으로 인사하기"
            aria-label="말풍선 메시지"
          />
          <button type="submit" className="btn btn-sm h-10">
            전송
          </button>
        </form>
        <div className="absolute bottom-4 right-3">
          <QuickMenu />
        </div>
        <p className="pointer-events-none absolute right-3 top-3 hidden rounded-md bg-black/60 px-2.5 py-1 text-xs text-white sm:block">
          방향키/WASD 이동 · 클릭으로 이동 · Space 열기
        </p>
      </div>
    </div>
  );
}
