'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';

const ITEMS = [
  { href: '/', label: '박스 공간', icon: '🏠' },
  { href: '/wod', label: 'WOD', icon: '📋' },
  { href: '/notices', label: '공지사항', icon: '📢' },
  { href: '/events?kind=competition', label: '대회·이벤트', icon: '🏆' },
  { href: '/events?kind=gathering', label: '모임', icon: '🍻' },
  { href: '/one-rm', label: '1RM', icon: '🏋️' },
  { href: '/wall', label: '명예의 벽', icon: '🎉' },
  { href: '/avatar', label: '캐릭터 꾸미기', icon: '👕' },
];

// 공간을 돌아다니지 않고 게시판으로 바로 가는 메뉴
export function QuickMenu() {
  const [open, setOpen] = useState(false);
  const { me, signOut } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

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
