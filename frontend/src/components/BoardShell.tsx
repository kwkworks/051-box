'use client';

import Link from 'next/link';
import { QuickMenu } from './QuickMenu';

// 게시판 공통 틀: 상단에 "박스로 돌아가기"
export function BoardShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-[var(--burgundy)] text-white">
        <div className="h-1.5 bg-yellow" />
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="btn btn-sm shrink-0" aria-label="박스로 돌아가기">
            ← 박스
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{title}</h1>
            {subtitle && <p className="truncate text-xs text-white/80">{subtitle}</p>}
          </div>
          {actions}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      <div className="fixed bottom-4 right-4 z-30">
        <QuickMenu />
      </div>
    </div>
  );
}
