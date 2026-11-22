'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

// 누르면 다른 화면으로 가는 카드. 링크(<a>) 대신 쓰는 이유:
// 갤럭시 등 휴대폰 다크 모드가 '가 본 링크'의 글자를 회색으로 바꾸는데, 링크가 아니면 그런 상태가 없다.
// 키보드(Enter)로도 열리고, 화면 낭독기에는 링크로 읽힌다. 이동할 화면은 미리 받아 둔다.
export function NavCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);
  // Ctrl/⌘ + 클릭(또는 가운데 버튼)은 링크처럼 새 탭으로
  const go = (newTab = false) => {
    if (newTab) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };
  return (
    <div
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className ?? ''}`}
      onClick={(e) => go(e.ctrlKey || e.metaKey)}
      onAuxClick={(e) => {
        if (e.button === 1) go(true);
      }}
      onKeyDown={(e) => {
        // 안쪽의 다른 버튼에서 누른 키는 무시하고, 카드 자체에서 Enter·스페이스를 누르면 연다
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go(e.ctrlKey || e.metaKey);
        }
      }}
    >
      {children}
    </div>
  );
}
