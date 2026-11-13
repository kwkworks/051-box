'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '@/lib/useDismiss';
import { BOARDS } from '@/game/map';
import { useAuth } from './AuthProvider';
import { InviteButton } from './InviteButton';

const ITEMS = [
  { href: '/', label: '박스 공간', icon: '🏠' },
  { href: BOARDS.hub.href, label: '게시판 (전체 보기)', icon: BOARDS.hub.icon },
  ...(['wod', 'notices', 'competition', 'gathering', 'one-rm', 'wall'] as const).map((k) => ({
    href: BOARDS[k].href,
    label: BOARDS[k].label,
    icon: BOARDS[k].icon,
  })),
  { href: '/avatar', label: '캐릭터 꾸미기', icon: '👕' },
];

// 공간을 돌아다니지 않고 게시판으로 바로 가는 메뉴
export function QuickMenu() {
  const [open, setOpen] = useState(false);
  const { me, signOut } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(open, useCallback(() => setOpen(false), []), ref);

  return (
    <div ref={ref} className="relative">
      {open && (
        <nav className="card absolute bottom-14 right-0 w-56 overflow-hidden p-1" aria-label="빠른 메뉴">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold hover:bg-[var(--bg)]"
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {me?.profile.role === 'admin' && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold text-[var(--burgundy)] hover:bg-[var(--bg)]"
            >
              <span aria-hidden>🔑</span>
              관리자
            </Link>
          )}
          <InviteButton
            compact
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold hover:bg-[var(--bg)]"
          />
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold text-muted hover:bg-[var(--bg)]"
          >
            <span aria-hidden>🚪</span>
            로그아웃
          </button>
        </nav>
      )}
      <button
        type="button"
        className="btn btn-primary h-12 px-4"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰ 메뉴
      </button>
    </div>
  );
}
